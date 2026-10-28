import { redirect } from "next/navigation";

export default async function LegacyExecutiveReportPage({ searchParams }) {
  const params = await searchParams;
  const query = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    if (Array.isArray(value)) value.forEach((item) => query.append(key, item));
    else if (value) query.set(key, value);
  });
  const suffix = query.toString();
  redirect(`/laporan-rawat-jalan${suffix ? `?${suffix}` : ""}`);
}
