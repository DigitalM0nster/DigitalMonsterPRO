import { forwardRef, useRef } from "react";
import GlitchText from "./GlitchText.jsx";
import { ROUTE_GLITCH_ELEMENT_CLASS } from "@/utils/routeStagger.js";

const PortfolioProjectsListItem = forwardRef(function PortfolioProjectsListItem({ project, displayName, index, isActive, isHovered, onSelect, onHover, onLeave }, ref) {
	const itemRef = useRef(null);
	const name = displayName ?? project.name;

	return (
		<div
			ref={itemRef}
			className={["item", ROUTE_GLITCH_ELEMENT_CLASS, isActive && "active", isHovered && "hovered"].filter(Boolean).join(" ")}
			data-stagger-i={index}
			role="button"
			tabIndex={0}
			aria-label={`Открыть — ${name}`}
			onClick={() => onSelect(project.path)}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					onSelect(project.path);
				}
			}}
			onPointerEnter={() => onHover(index)}
			onPointerLeave={onLeave}
		>
			<div className="itemContent">
				<GlitchText ref={ref} text={name} hoverTriggerRef={itemRef} className="itemName" initialHidden />
			</div>
		</div>
	);
});

export default PortfolioProjectsListItem;
