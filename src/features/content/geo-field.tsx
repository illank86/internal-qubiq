import { Form } from "antd";
import type { Place } from "@/lib/geocode";
import { LocationPicker } from "./location-picker";

export type GeoFill = { addressLine?: string; city?: string; region?: string; country?: string; postalCode?: string };

/**
 * The map pin as two form fields (latitude and longitude), inside whatever
 * form it sits in. A pin that resolves to an address fills the address
 * fields named in `fill`.
 */
export function GeoField({ latitudeName, longitudeName, fill }: { latitudeName: string; longitudeName: string; fill?: GeoFill }) {
  const form = Form.useFormInstance();
  const latitude = Form.useWatch(latitudeName, form) as number | null | undefined;
  const longitude = Form.useWatch(longitudeName, form) as number | null | undefined;

  const onPlace = (place: Place) => {
    if (!fill) return;
    const values: Record<string, string> = {};
    const set = (name: string | undefined, value: string | null) => {
      if (name && value) values[name] = value;
    };
    set(fill.addressLine, place.addressLine);
    set(fill.city, place.city);
    set(fill.region, place.region);
    set(fill.country, place.country);
    set(fill.postalCode, place.postalCode);
    form.setFieldsValue(values);
  };

  return (
    <>
      <Form.Item name={latitudeName} hidden>
        <input />
      </Form.Item>
      <Form.Item name={longitudeName} hidden>
        <input />
      </Form.Item>
      <LocationPicker
        latitude={latitude ?? null}
        longitude={longitude ?? null}
        onChange={(lat, lng) => form.setFieldsValue({ [latitudeName]: lat, [longitudeName]: lng })}
        onPlace={onPlace}
      />
    </>
  );
}
