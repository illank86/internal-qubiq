import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Alert, Button, Empty, Flex, Select, Table, Tooltip, Typography } from "antd";
import { FileExcelOutlined, FilePdfOutlined } from "@ant-design/icons";
import { usePdfViewer } from "@/components/pdf-viewer-context";
import { supabase } from "@/lib/supabase";
import { idr, jakartaToday } from "./api";
import { exportExcel } from "./exports";
import { A1_ITEMS, type Form1721A1 } from "./payroll-a1";

/**
 * Year-end PPh 21 (1721-A1) for permanent employees: the working behind the
 * bukti potong made in Coretax, and the employee's copy. A year is final once
 * December (or the leaving month) is posted.
 */
export function YearEnd() {
  const viewPdf = usePdfViewer();
  const thisYear = Number(jakartaToday().slice(0, 4));
  const [year, setYear] = useState(thisYear - (Number(jakartaToday().slice(5, 7)) <= 3 ? 1 : 0));
  const { data, isLoading } = useQuery({
    queryKey: ["form-1721a1", year],
    queryFn: async () => {
      const { data: lines, error } = await supabase
        .from("payroll_lines")
        .select("employee_id, employment_type, run:payroll_runs!inner(period, status)")
        .eq("run.status", "posted")
        .gte("run.period", `${year}-01-01`)
        .lte("run.period", `${year}-12-01`);
      if (error) throw error;
      const ids = [...new Set((lines ?? []).filter((line) => line.employment_type === "permanent").map((line) => line.employee_id))];
      const forms = await Promise.all(
        ids.map(async (id) => {
          const { data: form, error: formError } = await supabase.rpc("form_1721a1", { p_employee: id, p_year: year });
          if (formError) throw formError;
          return form ? ({ ...(form as unknown as Form1721A1), employee_id: id } as Form1721A1) : null;
        }),
      );
      return forms.filter((form): form is Form1721A1 => Boolean(form)).sort((a, b) => a.employee.name.localeCompare(b.employee.name));
    },
  });
  const forms = data ?? [];
  const open = (only?: Form1721A1) =>
    viewPdf({
      title: only ? `1721-A1 · ${only.employee.name} · ${year}` : `1721-A1 · ${year}`,
      fileName: only ? `1721-A1_${year}_${only.employee.name.replace(/\W+/g, "-").toLowerCase()}.pdf` : `1721-A1_${year}.pdf`,
      note: "The working for the bukti potong made in Coretax — not the official form.",
      make: async () => (await import("./payroll-a1-file")).a1Pdf(only ? [only] : forms),
    });
  const excel = () =>
    exportExcel(`1721-A1_${year}.xlsx`, `Tahun ${year}`, [
      {
        name: "1721-A1",
        title: "Rekap bukti potong 1721-A1 (pegawai tetap)",
        columns: [
          { header: "Nama", key: "name", width: 26 },
          { header: "NIK / NPWP", key: "id", width: 20 },
          { header: "PTKP", key: "ptkp", width: 8 },
          { header: "Masa", key: "masa", width: 9 },
          ...A1_ITEMS.map((item) => ({ header: `${item.no}. ${item.short}`, key: `i${item.no}`, kind: "money" as const })),
        ],
        rows: forms.map((form) => ({
          name: form.employee.name,
          id: form.employee.npwp || form.employee.nik || "",
          ptkp: form.employee.ptkp_status,
          masa: `${String(form.masa_from).padStart(2, "0")}–${String(form.masa_to).padStart(2, "0")}`,
          ...Object.fromEntries(A1_ITEMS.map((item) => [`i${item.no}`, Number(form.items[String(item.no)])])),
        })),
      },
    ]);
  const incomplete = forms.filter((form) => form.masa_to < 12 && !form.employee.left_on);
  return (
    <Flex vertical gap={16}>
      <Flex gap={8} align="center" wrap justify="space-between">
        <Flex gap={8} align="center">
          <Select value={year} onChange={setYear} style={{ width: 120 }} options={[thisYear, thisYear - 1, thisYear - 2].map((value) => ({ value, label: String(value) }))} />
          <Typography.Text type="secondary">Permanent employees with posted payroll in {year}.</Typography.Text>
        </Flex>
        <Flex gap={8}>
          <Button icon={<FileExcelOutlined />} disabled={!forms.length} onClick={excel}>
            Excel
          </Button>
          <Button type="primary" icon={<FilePdfOutlined />} disabled={!forms.length} onClick={() => open()}>
            All 1721-A1
          </Button>
        </Flex>
      </Flex>
      {incomplete.length ? (
        <Alert type="info" showIcon title={`${incomplete.length} employee(s) without December posted yet — their 1721-A1 is not final until the year is complete.`} />
      ) : null}
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        Give each employee their 1721-A1 by the end of January. In Coretax, the year-end bukti potong (BPA1) is made from the December PPh 21; these figures are the working behind it.
      </Typography.Text>
      <Table<Form1721A1>
        rowKey="employee_id"
        size="middle"
        loading={isLoading}
        dataSource={forms}
        pagination={false}
        locale={{ emptyText: <Empty description={`No posted payroll in ${year}`} /> }}
        columns={[
          { title: "Employee", key: "name", render: (_, form) => <Flex vertical><span>{form.employee.name}</span><Typography.Text type="secondary" style={{ fontSize: 12 }}>{form.employee.ptkp_status} · masa {form.masa_from}–{form.masa_to}</Typography.Text></Flex> },
          { title: "Gross for the year", key: "gross", align: "right", render: (_, form) => idr(form.items["8"]) },
          { title: "Taxable (PKP)", key: "pkp", align: "right", render: (_, form) => idr(form.items["16"]) },
          { title: "PPh 21 for the year", key: "tax", align: "right", render: (_, form) => idr(form.items["19"]) },
          {
            title: "Withheld",
            key: "withheld",
            align: "right",
            render: (_, form) => {
              const diff = Number(form.items["20"]) - Number(form.items["19"]);
              return (
                <Tooltip title={Math.abs(diff) < 1 ? "Matches the year's tax" : diff > 0 ? "More withheld than due" : "Less withheld than due — December not posted yet?"}>
                  <Typography.Text type={Math.abs(diff) < 1 ? undefined : "warning"}>{idr(form.items["20"])}</Typography.Text>
                </Tooltip>
              );
            },
          },
          { title: <span className="sr-only">PDF</span>, key: "pdf", width: 60, render: (_, form) => <Button size="small" type="text" icon={<FilePdfOutlined />} aria-label={`1721-A1 for ${form.employee.name}`} onClick={() => open(form)} /> },
        ]}
      />
    </Flex>
  );
}
