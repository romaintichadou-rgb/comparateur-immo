import { AppMark } from "@/components/Navbar";
import { APP_NAME } from "@/lib/constants";

const split = APP_NAME.toLowerCase().indexOf("score");
const head = split > 0 ? APP_NAME.slice(0, split) : APP_NAME;
const tail = split > 0 ? APP_NAME.slice(split) : "";

export default function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[calc(100dvh-5rem)]">
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-accent-50 via-white to-accent-50/50 lg:flex lg:w-[45%] lg:flex-col lg:items-center lg:justify-center">
        <div className="absolute inset-0 bg-tech-grid" />
        <div className="relative flex flex-col items-center px-12">
          <AppMark className="h-20 w-20 text-accent-600" />
          <p className="mt-6 font-wordmark text-2xl tracking-tight text-ink-900">
            <span className="font-normal">{head}</span>
            {tail && <span className="font-bold text-accent-600">{tail}</span>}
          </p>
          <p className="mt-3 max-w-xs text-center text-sm leading-relaxed text-ink-500">
            Le score d&rsquo;un investissement locatif, en un coup d&rsquo;œil.
          </p>
        </div>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center bg-white px-4 py-12">
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </div>
  );
}
