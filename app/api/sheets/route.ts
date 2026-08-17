const ALLOWED_SHEETS = new Set(["System Overview", "Sales CRM", "Closed Deals", "Events", "Payouts", "Booked Calls"]);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const spreadsheetId = url.searchParams.get("spreadsheetId") ?? "";
  const sheet = url.searchParams.get("sheet") ?? "System Overview";

  if (!/^[a-zA-Z0-9_-]{20,}$/.test(spreadsheetId)) {
    return Response.json({ error: "Invalid spreadsheet ID" }, { status: 400 });
  }
  if (!ALLOWED_SHEETS.has(sheet)) {
    return Response.json({ error: "Unsupported worksheet" }, { status: 400 });
  }

  const source = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheet)}`;
  const response = await fetch(source, { cache: "no-store", headers: { "User-Agent": "MoonRift/1.0", "Cache-Control": "no-cache" } });
  if (!response.ok) {
    return Response.json(
      { error: "The spreadsheet could not be read. Confirm that link sharing allows viewers." },
      { status: 502 },
    );
  }

  return new Response(await response.text(), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
