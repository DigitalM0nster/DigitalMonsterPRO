import { usePageStateClasses } from "@/app/context/RouteTransitionContext.jsx";

/** Visual content and reading controls are owned by the prepared WebGL interface. */
export default function AboutPage() {
 const pageClassName = usePageStateClasses("about");
 return <div className={pageClassName} data-about-experience-root="" aria-label="About Digital Monster" />;
}
