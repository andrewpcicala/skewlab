import FindingsView from "./components/FindingsView";

const buildDate = new Date().toLocaleDateString("en-US", {
  month: "long",
  year:  "numeric",
}).toUpperCase();

export default function FindingsPage() {
  return <FindingsView buildDate={buildDate} />;
}
