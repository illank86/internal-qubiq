/** The 1721-A1 working (from form_1721a1): numbered items as on the DJP form. */
export type Form1721A1 = {
  employee_id: string;
  employee: { name: string; nik: string | null; npwp: string | null; position: string | null; ptkp_status: string; joined_on: string; left_on: string | null; permanent: boolean };
  year: number;
  masa_from: number;
  masa_to: number;
  months: number;
  items: Record<string, number>;
};

export const A1_ITEMS: { no: number; label: string; short: string; group: "bruto" | "pengurang" | "hitung" }[] = [
  { no: 1, label: "Gaji/pensiun atau THT/JHT", short: "Gaji", group: "bruto" },
  { no: 2, label: "Tunjangan PPh", short: "Tunj. PPh", group: "bruto" },
  { no: 3, label: "Tunjangan lainnya, uang lembur dan sebagainya", short: "Tunj. lain", group: "bruto" },
  { no: 4, label: "Honorarium dan imbalan lain sejenisnya", short: "Honorarium", group: "bruto" },
  { no: 5, label: "Premi asuransi yang dibayar pemberi kerja", short: "Premi", group: "bruto" },
  { no: 6, label: "Penerimaan dalam bentuk natura dan kenikmatan lainnya yang dikenakan PPh 21", short: "Natura", group: "bruto" },
  { no: 7, label: "Tantiem, bonus, gratifikasi, jasa produksi dan THR", short: "Bonus/THR", group: "bruto" },
  { no: 8, label: "Jumlah penghasilan bruto (1 s.d. 7)", short: "Bruto", group: "bruto" },
  { no: 9, label: "Biaya jabatan/biaya pensiun", short: "Biaya jabatan", group: "pengurang" },
  { no: 10, label: "Iuran pensiun atau iuran THT/JHT", short: "Iuran", group: "pengurang" },
  { no: 11, label: "Jumlah pengurangan (9 s.d. 10)", short: "Pengurang", group: "pengurang" },
  { no: 12, label: "Jumlah penghasilan neto (8 − 11)", short: "Neto", group: "hitung" },
  { no: 13, label: "Penghasilan neto masa sebelumnya", short: "Neto sebelumnya", group: "hitung" },
  { no: 14, label: "Jumlah penghasilan neto untuk penghitungan PPh 21 (setahun/disetahunkan)", short: "Neto setahun", group: "hitung" },
  { no: 15, label: "Penghasilan tidak kena pajak (PTKP)", short: "PTKP", group: "hitung" },
  { no: 16, label: "Penghasilan kena pajak setahun/disetahunkan (14 − 15)", short: "PKP", group: "hitung" },
  { no: 17, label: "PPh 21 atas penghasilan kena pajak setahun/disetahunkan", short: "PPh 21 PKP", group: "hitung" },
  { no: 18, label: "PPh 21 yang telah dipotong masa sebelumnya", short: "Dipotong sebelumnya", group: "hitung" },
  { no: 19, label: "PPh 21 terutang", short: "PPh 21 terutang", group: "hitung" },
  { no: 20, label: "PPh 21 dan PPh 21 DTP yang telah dipotong dan dilunasi", short: "Dipotong", group: "hitung" },
];
