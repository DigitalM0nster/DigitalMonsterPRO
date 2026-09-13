import { Navigate, useParams } from "react-router-dom";
import {
	CAPABILITIES,
	FIRST_CAPABILITY_PATH,
	getCapabilityBySlug,
} from "@/pages/capabilities/data/capabilities.js";
import { usePageStateClasses } from "@/app/context/RouteTransitionContext.jsx";
import styles from "./CapabilitiesPage.module.scss";

export default function CapabilitiesPage() {
	const { "*": nestedPath = "" } = useParams();
	const slug = nestedPath.split("/").filter(Boolean)[0] ?? null;
	const pageClassName = usePageStateClasses("capabilities");
	const active = getCapabilityBySlug(slug);

	if (!slug || !CAPABILITIES.some((capability) => capability.id === slug)) {
		return <Navigate to={FIRST_CAPABILITY_PATH} replace />;
	}

	return <div className={`${pageClassName} ${styles.page}`} data-capability-id={active.id} />;
}
