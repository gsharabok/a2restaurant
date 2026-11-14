import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  ChartColumn,
  ExternalLink,
  LayoutDashboard,
  Lightbulb,
  MessageCircleQuestion,
  Mic,
  ReceiptText,
  Sparkles,
  UtensilsCrossed,
} from "lucide-react";
import { getDashboard, type Dashboard as DashboardData, type HourPoint, type UnmetKind, type UnmetRequest } from "@/lib/dashboard";
import { formatPrice } from "@/lib/format";
import { DEFAULT_RESTAURANT, menus } from "@/lib/menu";

const pounds = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 });
const percent = (value: number) => `${Math.round(value * 100)}%`;
const dashboardPath = (id: string) => (id === DEFAULT_RESTAURANT ? "/dashboard" : `/dashboard/${id}`);

const NAV = [
  { href: "#overview", label: "Overview", icon: LayoutDashboard },
  { href: "#missed", label: "Missed demand", icon: MessageCircleQuestion },
  { href: "#sales", label: "Sales", icon: ChartColumn },
  { href: "#menu", label: "Menu", icon: UtensilsCrossed },
  { href: "#orders", label: "Orders", icon: ReceiptText },
];

const CATEGORY_COLOURS = ["bg-indigo-600", "bg-sky-500", "bg-teal-500", "bg-amber-400", "bg-rose-400", "bg-slate-400"];

const KIND_STYLES: Record<UnmetKind, string> = {
  "Not on the menu": "bg-amber-100 text-amber-900 ring-amber-300/70",
  "Option not offered": "bg-violet-100 text-violet-800 ring-violet-200",
  "Sold out": "bg-rose-100 text-rose-800 ring-rose-200",
};

/** Menu art is a local icon or a product photo hosted by the restaurant. */
function Thumb({ src, size = 36 }: { src: string; size?: number }) {
  const frame = "relative block shrink-0 overflow-hidden rounded-lg bg-slate-100 ring-1 ring-slate-200";
  if (!src.startsWith("http")) {
    return (
      <span className={`${frame} p-1.5`} style={{ width: size, height: size }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- small local SVGs, no optimisation needed */}
        <img src={src} alt="" className="h-full w-full" />
      </span>
    );
  }
  return (
    <span className={frame} style={{ width: size, height: size }}>
      <Image src={src} alt="" fill sizes={`${size * 2}px`} className="object-cover" />
    </span>
  );
}

function Card({ id, title, note, action, className = "", children }: { id?: string; title: string; note?: string; action?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <section id={id} className={`scroll-mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] ${className}`}>
      <header className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
          {note && <p className="mt-0.5 text-xs text-slate-500">{note}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

function Change({ value }: { value: number }) {
  const up = value >= 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-medium ${up ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
      <Icon className="size-3" />
      {Math.abs(value * 100).toFixed(1)}%
    </span>
  );
}

function Kpi({ label, value, change, detail }: { label: string; value: string; change?: number; detail: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <div className="mt-2 flex items-baseline gap-2">
        <p className="text-[28px] leading-none font-semibold tracking-tight text-slate-900 tabular-nums">{value}</p>
        {change !== undefined && <Change value={change} />}
      </div>
      <p className="mt-2 text-xs text-slate-500">{detail}</p>
    </div>
  );
}

function Sidebar({ data }: { data: DashboardData }) {
  return (
    <aside className="sticky top-0 flex h-dvh w-56 shrink-0 flex-col border-r border-slate-200 bg-white px-4 py-5">
      <div className="flex items-center gap-2.5 px-2">
        <span className="grid size-8 place-items-center rounded-lg bg-slate-900 text-white">
          <Mic className="size-4" />
        </span>
        <div className="leading-tight">
          <p className="text-sm font-semibold text-slate-900">Voice Waiter</p>
          <p className="text-[11px] text-slate-500">for restaurants</p>
        </div>
      </div>

      <p className="mt-7 px-2 text-[11px] font-medium tracking-wide text-slate-400 uppercase">Restaurant</p>
      <nav className="mt-2 space-y-1">
        {Object.entries(menus).map(([id, menu]) => (
          <Link
            key={id}
            href={dashboardPath(id)}
            aria-current={id === data.id ? "page" : undefined}
            className={`flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm ${id === data.id ? "bg-slate-100 font-medium text-slate-900" : "text-slate-600 hover:bg-slate-50"}`}
          >
            <span className={`grid size-6 place-items-center rounded-md text-[11px] font-semibold ${id === data.id ? "bg-indigo-600 text-white" : "bg-slate-200 text-slate-600"}`}>
              {menu.restaurant.name[0]}
            </span>
            {menu.restaurant.name}
          </Link>
        ))}
      </nav>

      <p className="mt-7 px-2 text-[11px] font-medium tracking-wide text-slate-400 uppercase">Today</p>
      <nav className="mt-2 space-y-0.5">
        {NAV.map(({ href, label, icon: Icon }) => (
          <a key={href} href={href} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-900">
            <Icon className="size-4 text-slate-400" />
            {label}
            {href === "#missed" && <span className="ml-auto rounded-full bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800 tabular-nums">{data.unmet.today}</span>}
          </a>
        ))}
      </nav>

      <div className="mt-auto space-y-3">
        <Link href={`/${data.id}`} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
          Open guest screen
          <ExternalLink className="size-3.5 text-slate-400" />
        </Link>
        <p className="px-1 text-[11px] leading-snug text-slate-400">Sample data, generated from the real menu for this demo.</p>
      </div>
    </aside>
  );
}

function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(...values, 1);
  return (
    <span className="flex h-6 items-end gap-0.5" aria-hidden>
      {values.map((value, index) => (
        <span key={index} className={`w-1.5 rounded-sm ${index === values.length - 1 ? "bg-amber-500" : "bg-amber-300/80"}`} style={{ height: `${Math.max(12, (value / max) * 100)}%` }} />
      ))}
    </span>
  );
}

function UnmetRow({ request, max }: { request: UnmetRequest; max: number }) {
  return (
    <tr className="border-t border-amber-200/60">
      <td className="py-2.5 pr-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold whitespace-nowrap text-slate-900">{request.ask}</span>
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ring-1 ring-inset ${KIND_STYLES[request.kind]}`}>{request.kind}</span>
        </div>
        <p className="mt-0.5 text-xs whitespace-nowrap text-slate-500 italic">“{request.quote}”</p>
      </td>
      <td className="py-2.5 pr-4">
        <div className="flex items-center gap-2.5">
          <span className="w-6 text-right text-sm font-semibold text-slate-900 tabular-nums">{request.weekly}</span>
          <span className="hidden h-1.5 w-20 overflow-hidden rounded-full bg-amber-100 min-[1400px]:block">
            <span className="block h-full rounded-full bg-amber-500" style={{ width: `${(request.weekly / max) * 100}%` }} />
          </span>
        </div>
      </td>
      <td className="py-2.5 pr-4">
        <Sparkline values={request.daily} />
      </td>
      <td className="py-2.5 pr-4">
        <div className="flex items-center gap-2">
          <Thumb src={request.closest.image} size={32} />
          <div className="min-w-0 leading-tight">
            <p className="max-w-28 truncate text-xs min-[1400px]:max-w-40 font-medium text-slate-800">{request.closest.name}</p>
            <p className="text-[11px] text-slate-500">{percent(request.accepted)} took it instead</p>
          </div>
        </div>
      </td>
      <td className="py-2.5 text-right text-sm font-semibold text-slate-900 tabular-nums">{pounds.format(request.missed)}</td>
    </tr>
  );
}

function MissedDemand({ data }: { data: DashboardData }) {
  const { unmet } = data;
  const top = unmet.requests[0];
  const max = Math.max(...unmet.requests.map((request) => request.weekly));
  return (
    <section id="missed" className="scroll-mt-6 overflow-hidden rounded-xl border border-amber-300/80 bg-gradient-to-br from-amber-50 via-white to-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(217,119,6,0.35)]">
      <div className="grid grid-cols-[minmax(0,15.5rem)_minmax(0,1fr)]">
        <div className="flex flex-col border-r border-amber-200/70 p-5">
          <div className="flex items-center gap-2">
            <span className="grid size-7 place-items-center rounded-lg bg-amber-500 text-white">
              <MessageCircleQuestion className="size-4" />
            </span>
            <h2 className="text-sm font-semibold text-slate-900">Missed demand</h2>
          </div>
          <span className="mt-3 self-start rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-white uppercase">Only with voice</span>
          <p className="mt-2 text-xs leading-relaxed text-slate-600">What guests asked the waiter for that the menu could not give them. A till never sees these.</p>

          <div className="mt-5 grid grid-cols-2 gap-4">
            <div>
              <p className="text-3xl leading-none font-semibold tracking-tight text-slate-900 tabular-nums">{unmet.weekly}</p>
              <p className="mt-1.5 text-xs text-slate-500">requests in 7 days</p>
            </div>
            <div>
              <p className="text-3xl leading-none font-semibold tracking-tight text-amber-700 tabular-nums">{pounds.format(unmet.missed)}</p>
              <p className="mt-1.5 text-xs text-slate-500">est. sales missed</p>
            </div>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            <span className="font-medium text-slate-700">{unmet.today} today</span> · about 1 in {Math.round(1 / unmet.orderShare)} orders
          </p>

          <div className="mt-auto pt-5">
            <div className="rounded-lg border border-amber-200 bg-white/80 p-3">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-amber-700 uppercase">
                <Lightbulb className="size-3.5" />
                Suggested
              </p>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-700">
                {top.kind === "Sold out" ? "Stock more " : "Add "}
                <span className="font-semibold text-slate-900">{top.ask}</span>: asked for {top.weekly} times this week, and {percent(1 - top.accepted)} of those guests took nothing in its place.
              </p>
            </div>
          </div>
        </div>

        <div className="px-5 pt-4 pb-3">
          <table className="w-full text-left">
            <thead>
              <tr className="text-[11px] font-medium tracking-wide text-slate-500 uppercase">
                <th className="pb-2 font-medium">Guests asked for</th>
                <th className="pb-2 pr-4 font-medium whitespace-nowrap">Asked, 7 days</th>
                <th className="pb-2 pr-4 font-medium whitespace-nowrap">By day</th>
                <th className="pb-2 pr-4 font-medium whitespace-nowrap">Closest on your menu</th>
                <th className="pb-2 text-right font-medium whitespace-nowrap">Est. missed</th>
              </tr>
            </thead>
            <tbody>
              {unmet.requests.slice(0, 6).map((request) => (
                <UnmetRow key={request.ask} request={request} max={max} />
              ))}
            </tbody>
          </table>
          <p className="mt-1 border-t border-amber-200/60 pt-2 text-[11px] text-slate-400">Est. missed = requests where the guest took nothing instead × the price of the closest item.</p>
        </div>
      </div>
    </section>
  );
}

function HourlyChart({ hours }: { hours: HourPoint[] }) {
  const max = Math.max(...hours.flatMap((hour) => [hour.revenue, hour.lastWeek]));
  const step = max > 400 ? 200 : 100;
  const top = Math.ceil(max / step) * step;
  const ticks = Array.from({ length: top / step + 1 }, (_, index) => top - index * step);
  return (
    <div className="flex gap-3">
      <div className="flex h-56 flex-col justify-between text-right text-[11px] text-slate-400 tabular-nums">
        {ticks.map((tick) => (
          <span key={tick} className="-my-1.5 leading-3">
            £{tick}
          </span>
        ))}
      </div>
      <div className="min-w-0 flex-1">
        <div className="relative h-56">
          <div className="absolute inset-0 flex flex-col justify-between">
            {ticks.map((tick) => (
              <span key={tick} className="border-t border-slate-100" />
            ))}
          </div>
          <div className="absolute inset-0 flex items-end gap-2">
            {hours.map((hour) => (
              <div key={hour.label} className="group relative flex h-full flex-1 items-end justify-center gap-1">
                <span className="w-1/3 max-w-3.5 rounded-t bg-slate-200" style={{ height: `${(hour.lastWeek / top) * 100}%` }} />
                <span
                  className={`w-1/2 max-w-6 rounded-t ${hour.forecast ? "border border-b-0 border-dashed border-indigo-300 bg-indigo-50" : "bg-indigo-600 group-hover:bg-indigo-500"}`}
                  style={{ height: `${(hour.revenue / top) * 100}%` }}
                />
                <span className="pointer-events-none absolute bottom-full z-10 mb-1 hidden rounded-md bg-slate-900 px-2 py-1 text-[11px] whitespace-nowrap text-white shadow-lg group-hover:block">
                  {hour.forecast ? "Forecast " : ""}
                  {pounds.format(hour.revenue)} · {hour.orders} orders
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-2 flex gap-2 text-center text-[11px] text-slate-500">
          {hours.map((hour) => (
            <span key={hour.label} className="flex-1">
              {hour.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function Legend() {
  return (
    <div className="flex items-center gap-4 text-[11px] text-slate-500">
      <span className="flex items-center gap-1.5">
        <span className="size-2 rounded-sm bg-indigo-600" />
        Today
      </span>
      <span className="flex items-center gap-1.5">
        <span className="size-2 rounded-sm border border-dashed border-indigo-300 bg-indigo-50" />
        Forecast
      </span>
      <span className="flex items-center gap-1.5">
        <span className="size-2 rounded-sm bg-slate-200" />
        Last week
      </span>
    </div>
  );
}

function TrendChart({ days }: { days: number[] }) {
  const min = Math.min(...days) * 0.9;
  const max = Math.max(...days) * 1.04;
  const x = (index: number) => (index / (days.length - 1)) * 100;
  const y = (value: number) => 100 - ((value - min) / (max - min)) * 100;
  const line = days.map((value, index) => `${index === 0 ? "M" : "L"}${x(index).toFixed(2)},${y(value).toFixed(2)}`).join(" ");
  const average = days.reduce((sum, value) => sum + value, 0) / days.length;
  const best = Math.max(...days.slice(0, -1));
  return (
    <div>
      <div className="relative h-32">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
          <defs>
            <linearGradient id="trend-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#4f46e5" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#4f46e5" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={`${line} L100,100 L0,100 Z`} fill="url(#trend-fill)" />
          <line x1="0" x2="100" y1={y(average)} y2={y(average)} stroke="#cbd5e1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
          <path d={line} fill="none" stroke="#4f46e5" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        </svg>
        <span className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-indigo-600 bg-white" style={{ left: "100%", top: `${y(days.at(-1)!)}%` }} />
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-slate-500">
        <span>2 weeks ago</span>
        <span>Last week</span>
        <span>Today (forecast)</span>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-3 text-xs">
        <div>
          <dt className="text-slate-500">Daily average</dt>
          <dd className="mt-0.5 text-sm font-semibold text-slate-900 tabular-nums">{pounds.format(average)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Best day</dt>
          <dd className="mt-0.5 text-sm font-semibold text-slate-900 tabular-nums">{pounds.format(best)}</dd>
        </div>
      </dl>
    </div>
  );
}

export function Dashboard({ id }: { id: string }) {
  const data = getDashboard(id);
  const topQty = data.topSellers[0]?.qty ?? 1;
  return (
    <div className="flex min-h-dvh bg-slate-50 text-slate-900">
      <Sidebar data={data} />
      <main id="overview" className="min-w-0 flex-1 px-7 py-6">
        <div className="mx-auto max-w-[1280px] space-y-5">
          <header className="flex items-end justify-between gap-6">
            <div>
              <p className="text-xs text-slate-500">{data.tagline}</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">{data.name} · Today</h1>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span title={`Generated from the real menu. ${data.priceNote}`} className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-500">
                Sample data
              </span>
              <span className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-700">
                <span className="size-1.5 rounded-full bg-emerald-500" />
                Open · as of {data.asOf}
              </span>
            </div>
          </header>

          <div className="grid grid-cols-4 gap-5">
            <Kpi label="Revenue so far" value={pounds.format(data.revenue)} change={data.change.revenue} detail={`On track for ${pounds.format(data.forecastRevenue)} by close`} />
            <Kpi label="Orders" value={String(data.orders)} change={data.change.orders} detail={`${data.itemsSold} items · busiest at ${data.peak}`} />
            <Kpi label="Average order" value={formatPrice(data.average)} change={data.change.average} detail={`${(data.itemsSold / data.orders).toFixed(1)} items per order`} />
            <Kpi
              label="Waiter suggestions accepted"
              value={percent(data.offer.accepted / data.offer.made)}
              detail={`${data.offer.accepted} of ${data.offer.made} offers · ${pounds.format(data.offer.revenue)} added`}
            />
          </div>

          <MissedDemand data={data} />

          <div className="grid grid-cols-12 gap-5">
            <Card id="sales" title="Revenue by hour" note="Against the same day last week" action={<Legend />} className="col-span-7">
              <HourlyChart hours={data.hours} />
            </Card>

            <Card id="menu" title="Best sellers" note="By items sold today" className="col-span-5">
              <ul className="space-y-2.5">
                {data.topSellers.map((item) => (
                  <li key={item.id} className="flex items-center gap-3">
                    <Thumb src={item.image} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="truncate text-sm font-medium text-slate-900">{item.name}</p>
                        <p className="shrink-0 text-xs text-slate-500 tabular-nums">
                          <span className="font-semibold text-slate-900">{item.qty}</span> · {pounds.format(item.revenue)}
                        </p>
                      </div>
                      <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-slate-100">
                        <span className="block h-full rounded-full bg-indigo-600" style={{ width: `${(item.qty / topQty) * 100}%` }} />
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>

            <Card title="Last 14 days" note="Daily revenue" className="col-span-4">
              <TrendChart days={data.days} />
            </Card>

            <Card title="Sales mix" note="Share of today's revenue" className="col-span-3">
              <div className="flex h-2.5 overflow-hidden rounded-full">
                {data.categories.map((category, index) => (
                  <span key={category.label} className={`${CATEGORY_COLOURS[index % CATEGORY_COLOURS.length]} border-r border-white last:border-0`} style={{ width: `${category.share * 100}%` }} />
                ))}
              </div>
              <ul className="mt-3 space-y-1.5">
                {data.categories.map((category, index) => (
                  <li key={category.label} className="flex items-center gap-2 text-xs">
                    <span className={`size-2 rounded-sm ${CATEGORY_COLOURS[index % CATEGORY_COLOURS.length]}`} />
                    <span className="text-slate-700">{category.label}</span>
                    <span className="ml-auto text-slate-500 tabular-nums">{pounds.format(category.revenue)}</span>
                    <span className="w-8 text-right font-medium text-slate-900 tabular-nums">{percent(category.share)}</span>
                  </li>
                ))}
              </ul>
              {data.choices[0] && (
                <div className="mt-4 border-t border-slate-100 pt-3">
                  <p className="flex items-center gap-1.5 text-xs font-medium text-slate-700">
                    <Sparkles className="size-3.5 text-indigo-500" />
                    {data.choices[0].title} guests choose
                  </p>
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-500">{data.choices[0].rows.map((row) => `${row.label} ${percent(row.share)}`).join(" · ")}</p>
                </div>
              )}
            </Card>

            <Card id="orders" title="Latest orders" note="Taken by the voice waiter" className="col-span-5">
              <ul className="divide-y divide-slate-100">
                {data.recent.map((order) => (
                  <li key={order.number} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
                    <span className="w-10 text-xs text-slate-500 tabular-nums">{order.time}</span>
                    <span className="flex -space-x-2">
                      {order.images.slice(0, 2).map((image, index) => (
                        <Thumb key={index} src={image} size={28} />
                      ))}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-slate-800">{order.summary}</span>
                      <span className="block text-[11px] text-slate-400">
                        #{order.number}
                        {order.offerAccepted && <span className="ml-1.5 text-emerald-600">· took the waiter&apos;s suggestion</span>}
                      </span>
                    </span>
                    <span className="text-sm font-medium text-slate-900 tabular-nums">{formatPrice(order.total)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          <p className="pb-2 text-[11px] leading-relaxed text-slate-400">
            Sample data for this demo: orders and requests are generated from {data.name}&apos;s real menu, not recorded from guests. {data.priceNote}
          </p>
        </div>
      </main>
    </div>
  );
}
