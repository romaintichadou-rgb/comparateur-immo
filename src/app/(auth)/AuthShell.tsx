import { AppMark } from "@/components/Navbar";
import { APP_NAME } from "@/lib/constants";

const split = APP_NAME.toLowerCase().indexOf("score");
const head = split > 0 ? APP_NAME.slice(0, split) : APP_NAME;
const tail = split > 0 ? APP_NAME.slice(split) : "";

const STEPS = [
  { title: "Colle une annonce", desc: "Leboncoin, SeLoger, PAP, Orpi" },
  { title: "Chaque bien est noté sur 10", desc: "Rendement, cash-flow, quartier, risques" },
  { title: "Repère le bon investissement", desc: "Compare tes pistes en un coup d’œil" },
];

export default function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[calc(100dvh-5rem)]">
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-accent-50 via-white to-accent-50/50 lg:flex lg:w-[45%] lg:flex-col lg:items-center lg:justify-center">
        <div className="absolute inset-0 bg-tech-grid" />
        <div className="relative flex flex-col items-center px-10">
          <div className="relative flex h-16 w-16 items-center justify-center">
            <span className="absolute inset-0 rounded-full bg-accent-100/70 blur-xl" />
            <span className="relative flex h-12 w-12 items-center justify-center rounded-md border border-ink-100 bg-white shadow-lg shadow-accent-100">
              <AppMark className="h-7 w-7 text-accent-600" />
            </span>
          </div>
          <p className="mt-4 font-wordmark text-xl tracking-tight text-ink-900">
            <span className="font-normal">{head}</span>
            {tail && <span className="font-bold text-accent-600">{tail}</span>}
          </p>

          <h2 className="mt-8 max-w-[17rem] text-center heading-h2">
            Trouve tes prochains investissements locatifs
          </h2>
          <p className="mt-3 max-w-xs text-center text-sm leading-relaxed text-ink-500">
            Chaque bien reçoit un score sur&nbsp;10 pour t&rsquo;aider à décider quel bien acheter.
          </p>

          <div className="mt-8 h-px w-10 bg-ink-200/60" />

          <div className="mt-8 space-y-4">
            {STEPS.map((step, i) => (
              <div key={step.title} className="flex items-start gap-3">
                <span className="font-mono text-xs font-semibold tracking-wide text-accent-600">
                  0{i + 1}
                </span>
                <div className="-mt-0.5">
                  <p className="text-sm font-semibold text-ink-800">{step.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-ink-400">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center bg-white px-4 py-12">
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </div>
  );
}
