import { useMemo, useState } from "react";
import { Flex, Input, Radio, Table, Tag, Typography } from "antd";
import type { TableColumnsType } from "antd";

export type CustomerAccount = { id: string; name: string; email: string; company: string };

/**
 * Pick one customer account from many: a searchable table, with the accounts
 * whose email matches the quotation first, and an optional "no account yet"
 * choice above it. `value` is the account id, or "" for none.
 */
export function AccountPicker({
  accounts,
  value,
  onChange,
  matchEmail,
  noneLabel,
}: {
  accounts: CustomerAccount[];
  value: string;
  onChange: (id: string) => void;
  matchEmail: string;
  /** Offer "no account" as a choice, with this wording. */
  noneLabel?: React.ReactNode;
}) {
  const [search, setSearch] = useState("");
  const email = matchEmail.toLowerCase();
  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return [...accounts]
      .sort((a, b) => Number(b.email.toLowerCase() === email) - Number(a.email.toLowerCase() === email))
      .filter((account) => !query || account.id === value || `${account.name} ${account.email} ${account.company}`.toLowerCase().includes(query));
  }, [accounts, email, search, value]);

  const columns: TableColumnsType<CustomerAccount> = [
    { title: "Account", dataIndex: "name", render: (name: string) => <Typography.Text strong>{name}</Typography.Text> },
    {
      title: "Email",
      dataIndex: "email",
      render: (address: string) => (
        <Flex gap={6} wrap align="center">
          <span style={{ wordBreak: "break-all" }}>{address}</span>
          {email && address.toLowerCase() === email ? <Tag color="orange">Matches the quotation</Tag> : null}
        </Flex>
      ),
    },
    { title: "Company", dataIndex: "company", render: (company: string) => company || <Typography.Text type="secondary">—</Typography.Text>, responsive: ["md"] },
  ];

  return (
    <Flex vertical gap={12}>
      {noneLabel ? (
        <Radio checked={value === ""} onChange={() => onChange("")} style={{ padding: "8px 12px", border: "1px solid var(--ant-color-border)", borderRadius: 8 }}>
          {noneLabel}
        </Radio>
      ) : null}
      <Flex justify="space-between" align="center" wrap gap={12}>
        <Input.Search allowClear placeholder="Search name, email or company" onChange={(event) => setSearch(event.target.value)} style={{ maxWidth: 360 }} />
        <Typography.Text type="secondary">
          {rows.length} of {accounts.length} accounts
        </Typography.Text>
      </Flex>
      <Table<CustomerAccount>
        rowKey="id"
        size="small"
        columns={columns}
        dataSource={rows}
        rowSelection={{ type: "radio", selectedRowKeys: value ? [value] : [], onChange: (keys) => onChange(String(keys[0] ?? "")) }}
        onRow={(record) => ({ onClick: () => onChange(record.id), style: { cursor: "pointer" } })}
        pagination={{ pageSize: 50, hideOnSinglePage: true, showSizeChanger: false }}
        scroll={{ y: 420 }}
        locale={{ emptyText: search ? `No account matches "${search}".` : "No customer accounts yet." }}
      />
    </Flex>
  );
}
