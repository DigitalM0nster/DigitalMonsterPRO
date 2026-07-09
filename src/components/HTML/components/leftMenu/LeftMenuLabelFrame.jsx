import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useStore } from "@/store.jsx";
import { getLeftMenuLabelFrameFillColor } from "./leftMenuLabelFrameFill.js";
import "./leftMenuGlitchText.scss";

export const LABEL_FRAME_HEIGHT = 38;

const CAP_RADIUS = LABEL_FRAME_HEIGHT / 2;
const TOP_Y = 0.5;
const BOTTOM_Y = LABEL_FRAME_HEIGHT - 0.5;
const STROKE = 1;
const LINE_JOIN_X = CAP_RADIUS + STROKE * 0.5;

function buildArcPath() {
	return `M ${CAP_RADIUS} ${TOP_Y} A ${CAP_RADIUS} ${CAP_RADIUS} 0 0 0 ${CAP_RADIUS} ${BOTTOM_Y}`;
}

function buildLinePath(width, y) {
	const w = Math.max(width, CAP_RADIUS + 1);
	return `M ${LINE_JOIN_X} ${y} H ${w}`;
}

function buildFillPath(width) {
	const w = Math.max(width, CAP_RADIUS + 1);
	return `M ${w} ${TOP_Y} H ${CAP_RADIUS} A ${CAP_RADIUS} ${CAP_RADIUS} 0 0 0 ${CAP_RADIUS} ${BOTTOM_Y} H ${w} Z`;
}

function buildLineFadeStops() {
	return {
		solidEnd: "42%",
		fadeMid: "78%",
	};
}

export default function LeftMenuLabelFrame({ className = "", enabled = true }) {
	const { backgroundBrightness } = useStore();
	const rootRef = useRef(null);
	const [width, setWidth] = useState(0);
	const uid = useId().replace(/:/g, "");
	const fillGradientId = `leftMenuLabelFill-${uid}`;
	const lineFadeGradientId = `leftMenuLabelLineFade-${uid}`;
	const lineMaskId = `leftMenuLabelLineMask-${uid}`;

	const fillColor = useMemo(
		() => getLeftMenuLabelFrameFillColor(backgroundBrightness),
		[backgroundBrightness],
	);

	useEffect(() => {
		const el = rootRef.current;
		if (!el) return undefined;

		const syncWidth = () => setWidth(el.getBoundingClientRect().width);
		syncWidth();

		const ro = new ResizeObserver(syncWidth);
		ro.observe(el);
		return () => ro.disconnect();
	}, []);

	const frameWidth = Math.max(width, CAP_RADIUS + 1);
	const linesWidth = Math.max(frameWidth - CAP_RADIUS, 1);
	const lineFadeStops = buildLineFadeStops();
	const fillRgb = `rgb(${fillColor.r}, ${fillColor.g}, ${fillColor.b})`;

	const strokeProps = {
		fill: "none",
		stroke: "currentColor",
		strokeWidth: STROKE,
		strokeLinecap: "butt",
		strokeLinejoin: "miter",
		strokeMiterlimit: 4,
	};

	return (
		<div
			ref={rootRef}
			className={["leftMenuLabelFrame", className].filter(Boolean).join(" ")}
			aria-hidden="true"
		>
			{enabled && width > 0 && (
				<svg
					className="leftMenuLabelFrameSvg"
					width={frameWidth}
					height={LABEL_FRAME_HEIGHT}
					viewBox={`0 0 ${frameWidth} ${LABEL_FRAME_HEIGHT}`}
					overflow="visible"
					shapeRendering="geometricPrecision"
				>
					<defs>
						<linearGradient
							id={fillGradientId}
							gradientUnits="userSpaceOnUse"
							x1="0"
							y1="0"
							x2={frameWidth}
							y2="0"
						>
							<stop offset="0%" stopColor={fillRgb} stopOpacity={fillColor.a} />
							<stop offset="100%" stopColor={fillRgb} stopOpacity="0" />
						</linearGradient>

						<linearGradient
							id={lineFadeGradientId}
							gradientUnits="userSpaceOnUse"
							x1={CAP_RADIUS}
							y1="0"
							x2={frameWidth}
							y2="0"
						>
							<stop offset="0%" stopColor="white" stopOpacity="1" />
							<stop offset={lineFadeStops.solidEnd} stopColor="white" stopOpacity="1" />
							<stop offset={lineFadeStops.fadeMid} stopColor="white" stopOpacity="0.35" />
							<stop offset="100%" stopColor="white" stopOpacity="0" />
						</linearGradient>
						<mask id={lineMaskId}>
							<rect
								x={CAP_RADIUS}
								y="0"
								width={linesWidth}
								height={LABEL_FRAME_HEIGHT}
								fill={`url(#${lineFadeGradientId})`}
							/>
						</mask>
					</defs>

					<path
						className="leftMenuLabelFrameFill"
						d={buildFillPath(frameWidth)}
						fill={`url(#${fillGradientId})`}
					/>

					<g className="leftMenuLabelFrameLines" mask={`url(#${lineMaskId})`}>
						<path d={buildLinePath(frameWidth, TOP_Y)} {...strokeProps} />
						<path d={buildLinePath(frameWidth, BOTTOM_Y)} {...strokeProps} />
					</g>

					<path className="leftMenuLabelFrameArc" d={buildArcPath()} {...strokeProps} />
				</svg>
			)}
		</div>
	);
}
