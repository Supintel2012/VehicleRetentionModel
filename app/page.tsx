import { DemoApp } from "@/components/demo/DemoApp";
import { SiteHeader } from "@/components/site/SiteHeader";

export default function Page() {
  return (
    <>
      <SiteHeader />
      {/* DemoApp renders the main content and the footer, which carries the latest run's attribution. */}
      <DemoApp />
    </>
  );
}
