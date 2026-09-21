import { ArrowUpRight, LayoutDashboard, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import Panel from "../components/Panel.jsx";

const modules = [
  {
    name: "Gate Control",
    description:
      "Monitor live gate status, send commands, and manage schedules.",
    href: "/dashboard",
    icon: LayoutDashboard,
    roles: ["admin"],
    tone: "text-steel",
  },
];

export default function DataHub() {
  const { user } = useAuth();
  const availableModules = modules.filter((module) =>
    module.roles.includes(user?.role),
  );

  return (
    <div className="space-y-8">
      <section className="border-b border-line pb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-steel">
          Data Hub / Workspace
        </p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">
              Good to see you, {user?.username}
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-muted">
              Your connected operations in one place. Choose a workspace to
              continue.
            </p>
          </div>
          <span className="inline-flex items-center gap-2 border border-line bg-panel px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted">
            <ShieldCheck aria-hidden="true" size={15} className="text-go" />
            {user?.role} access
          </span>
        </div>
      </section>

      <section aria-labelledby="modules-title">
        <div className="mb-3 flex items-center justify-between gap-4">
          <h2
            id="modules-title"
            className="text-xs font-semibold uppercase tracking-[0.14em] text-muted"
          >
            Available workspaces
          </h2>
          <span className="text-xs text-muted">
            {availableModules.length} enabled
          </span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {availableModules.map(
            ({ name, description, href, icon: Icon, tone }) => (
              <Link
                key={name}
                to={href}
                className="group border border-line bg-panel p-5 transition-colors hover:border-steel hover:bg-recess"
              >
                <div className="flex items-start justify-between gap-4">
                  <span
                    className={`flex size-11 items-center justify-center border border-line bg-recess ${tone}`}
                  >
                    <Icon aria-hidden="true" size={22} />
                  </span>
                  <ArrowUpRight
                    aria-hidden="true"
                    size={18}
                    className="text-muted transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-steel"
                  />
                </div>
                <h3 className="mt-8 text-xl font-semibold tracking-tight">
                  {name}
                </h3>
                <p className="mt-2 text-sm leading-6 text-muted">
                  {description}
                </p>
                <p className="mt-5 text-xs font-semibold uppercase tracking-[0.12em] text-steel">
                  Open workspace
                </p>
              </Link>
            ),
          )}
        </div>
        {availableModules.length === 0 && (
          <Panel title="No workspaces assigned">
            <p className="text-sm text-muted">
              Your account does not have access to a Data Hub workspace yet.
            </p>
          </Panel>
        )}
      </section>
    </div>
  );
}
