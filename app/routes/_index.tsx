import type { Route } from "./+types/_index";
import { Dashboard } from "../components/Dashboard";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "LifeLog" },
    { name: "description", content: "Personal life logging service" },
  ];
}

export default function Index() {
  return <Dashboard />;
}
