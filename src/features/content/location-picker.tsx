import { useCallback, useEffect, useRef, useState } from "react";
import type { Map as LeafletMap, Marker } from "leaflet";
import "leaflet/dist/leaflet.css";
import { AutoComplete, Button, Flex, Input, Spin, Tooltip, Typography, theme } from "antd";
import { AimOutlined, CloseOutlined, EnvironmentOutlined, SearchOutlined } from "@ant-design/icons";
import { formatCoordinate, isValidCoordinate, normaliseResults, type Place } from "@/lib/geocode";

const WORLD_VIEW: [number, number] = [8, 30];
const NOMINATIM = "https://nominatim.openstreetmap.org";

/**
 * Address search and reverse lookup against OpenStreetMap's Nominatim — the
 * same service the website uses. Called from the browser, which identifies
 * itself by Referer; staff use is a handful of lookups.
 */
async function lookup(path: "search" | "reverse", params: Record<string, string>, signal?: AbortSignal): Promise<Place[]> {
  const query = new URLSearchParams({ format: "jsonv2", addressdetails: "1", "accept-language": "en", ...params });
  const response = await fetch(`${NOMINATIM}/${path}?${query}`, { signal });
  if (!response.ok) return [];
  return normaliseResults(await response.json());
}

/**
 * Picks a point on a map instead of typing coordinates: search for a place,
 * click the map, drag the pin or use your location. Whenever the point
 * resolves to an address, `onPlace` reports it so the address fields can be
 * filled in.
 */
export function LocationPicker({
  latitude,
  longitude,
  onChange,
  onPlace,
}: {
  latitude: number | null;
  longitude: number | null;
  onChange: (latitude: number | null, longitude: number | null) => void;
  onPlace?: (place: Place) => void;
}) {
  const { token } = theme.useToken();
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const marker = useRef<Marker | null>(null);
  const [ready, setReady] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Place[]>([]);
  const [searching, setSearching] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [address, setAddress] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const hasPoint = latitude != null && longitude != null && isValidCoordinate(latitude, longitude);

  // Callbacks change every render; the map's own handlers read the latest ones.
  const latest = useRef({ onChange, onPlace });
  useEffect(() => {
    latest.current = { onChange, onPlace };
  }, [onChange, onPlace]);

  const resolve = useCallback(async (lat: number, lng: number) => {
    setResolving(true);
    try {
      const [found] = await lookup("reverse", { lat: String(lat), lon: String(lng), zoom: "18" });
      setAddress(found?.label ?? null);
      if (found) latest.current.onPlace?.({ ...found, latitude: lat, longitude: lng });
    } catch {
      setAddress(null);
    } finally {
      setResolving(false);
    }
  }, []);

  const moveTo = useCallback(
    (lat: number, lng: number, { reverse = true, focus = false } = {}) => {
      if (!isValidCoordinate(lat, lng)) return;
      setMessage(null);
      latest.current.onChange(Number(lat.toFixed(6)), Number(lng.toFixed(6)));
      if (focus) map.current?.setView([lat, lng], Math.max(map.current.getZoom() ?? 0, 14), { animate: true });
      if (reverse) void resolve(lat, lng);
    },
    [resolve],
  );
  const moveRef = useRef(moveTo);
  useEffect(() => {
    moveRef.current = moveTo;
  }, [moveTo]);

  // The map, once.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const L = await import("leaflet");
      if (cancelled || !container.current || map.current) return;
      const instance = L.map(container.current, { scrollWheelZoom: false });
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(instance);
      instance.on("click", (event) => moveRef.current(event.latlng.lat, event.latlng.lng));
      if (hasPoint) instance.setView([latitude!, longitude!], 13);
      else instance.setView(WORLD_VIEW, 2);
      map.current = instance;
      setReady(true);
    })();
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
      marker.current = null;
    };
    // The starting view only; later moves go through the marker effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The pin follows the value.
  useEffect(() => {
    if (!ready || !map.current) return;
    let cancelled = false;
    void (async () => {
      const L = await import("leaflet");
      if (cancelled || !map.current) return;
      if (!hasPoint) {
        marker.current?.remove();
        marker.current = null;
        return;
      }
      if (marker.current) {
        marker.current.setLatLng([latitude!, longitude!]);
        return;
      }
      const pin = L.marker([latitude!, longitude!], {
        draggable: true,
        title: "Drag to adjust",
        icon: L.divIcon({
          className: "",
          html: `<span style="display:grid;place-items:center;width:28px;height:28px;border-radius:50%;background:${token.colorPrimary};color:#fff;box-shadow:0 2px 10px rgba(0,0,0,.35);font-size:11px;font-weight:700">●</span>`,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        }),
      }).addTo(map.current);
      pin.on("dragend", () => {
        const next = pin.getLatLng();
        moveRef.current(next.lat, next.lng);
      });
      marker.current = pin;
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, hasPoint, latitude, longitude, token.colorPrimary]);

  // Search as you type, after a pause.
  useEffect(() => {
    const needle = query.trim();
    if (needle.length < 3) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        setResults(await lookup("search", { q: needle, limit: "6" }, controller.signal));
      } catch {
        // Aborted by a newer query, or the service is down: keep what is shown.
      } finally {
        setSearching(false);
      }
    }, 600);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const locateMe = () => {
    if (!navigator.geolocation) return setMessage("This browser cannot share a location. Search for the address instead.");
    setResolving(true);
    navigator.geolocation.getCurrentPosition(
      (found) => moveTo(found.coords.latitude, found.coords.longitude, { focus: true }),
      () => {
        setResolving(false);
        setMessage("Your location could not be read. Search for the address instead.");
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };

  return (
    <Flex vertical gap={8}>
      <Flex gap={8}>
        <AutoComplete
          value={query}
          onChange={setQuery}
          options={(query.trim().length >= 3 ? results : []).map((place, index) => ({ value: String(index), label: place.label }))}
          onSelect={(value: string) => {
            const chosen = results[Number(value)];
            if (!chosen) return;
            setQuery("");
            setResults([]);
            setAddress(chosen.label);
            moveTo(chosen.latitude, chosen.longitude, { reverse: false, focus: true });
            onPlace?.(chosen);
          }}
          style={{ flex: 1 }}
        >
          <Input prefix={searching ? <Spin size="small" /> : <SearchOutlined style={{ opacity: 0.5, marginInlineEnd: 4 }} />} placeholder="Search for an address or place" allowClear />
        </AutoComplete>
        <Tooltip title="Use my location">
          <Button icon={<AimOutlined />} onClick={locateMe} aria-label="Use my location" />
        </Tooltip>
        {hasPoint ? (
          <Tooltip title="Remove the pin">
            <Button
              icon={<CloseOutlined />}
              onClick={() => {
                onChange(null, null);
                setAddress(null);
                map.current?.setView(WORLD_VIEW, 2);
              }}
              aria-label="Remove the pin"
            />
          </Tooltip>
        ) : null}
      </Flex>
      <div ref={container} style={{ height: 300, borderRadius: token.borderRadiusLG, overflow: "hidden", border: `1px solid ${token.colorBorder}`, zIndex: 0 }} />
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        <EnvironmentOutlined />{" "}
        {resolving
          ? "Looking up the address…"
          : hasPoint
            ? `${address ?? "Pinned"} · ${formatCoordinate(latitude!)}, ${formatCoordinate(longitude!)}`
            : "No pin yet. Search, or click the map where the company is."}
      </Typography.Text>
      {message ? (
        <Typography.Text type="warning" style={{ fontSize: 12 }}>
          {message}
        </Typography.Text>
      ) : null}
    </Flex>
  );
}
