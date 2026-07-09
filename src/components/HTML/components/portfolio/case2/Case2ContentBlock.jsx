import { useEffect, useRef, useState } from "react";
import { useStore } from "@/store";
import Case2MoreContent from "./Case2MoreContent";
import { useSmoothCaseScroll } from "../useSmoothCaseScroll.js";
import { usePortfolioViewCaseButtonLabel } from "../usePortfolioViewCaseButtonLabel.js";

export default function Case1ContentBlock(props) {
	const store = useStore();
	const viewCaseLabel = usePortfolioViewCaseButtonLabel();
	const [windowWidth, setWindowWidth] = useState(window.innerWidth);
	const [openedCase, setOpenedCase] = useState(true);

	const caseContentBlock = useRef();
	const caseStartBlock = useRef();
	useSmoothCaseScroll(caseContentBlock, openedCase === true);

	useEffect(() => {
		if (windowWidth > 768) {
			setOpenedCase(true);
		} else {
			setOpenedCase(false);
		}
	}, [windowWidth]);

	return (
		<>
			<div
				className="caseContentBlock"
				ref={caseContentBlock}
				style={openedCase === true ? { overflowX: "hidden", overflowY: "auto" } : { overflowX: "hidden", overflowY: "hidden" }}
			>
				<div ref={caseStartBlock} className={openedCase === true ? "caseStartBlock active" : "caseStartBlock"}>
					<div className="caseTitleButton">
						<div
							className="caseButton back"
							style={windowWidth > 768 ? { display: "none" } : {}}
							onClick={() => {
								setOpenedCase(false);
								store.openedCase = false;
							}}
						>
							<div className="caseButtonArrowBlock back">
								<div className="arrowImg">
									<img src="/images/arrowX.svg" />
								</div>
								<div className="arrowLine" />
							</div>
							<div className="caseButtonText">Закрыть</div>
							<div className="caseButtonLineBlock back"></div>
						</div>
						<div className="caseTitle">Troof</div>
						<div
							className="caseButton"
							style={windowWidth > 768 ? { display: "none" } : {}}
							onClick={() => {
								setOpenedCase(true);
								store.openedCase = true;
							}}
						>
							<div className="caseButtonLineBlock"></div>
							<div className="caseButtonText">{viewCaseLabel}</div>
							<div className="caseButtonArrowBlock">
								<div className="arrowLine"></div>
								<div className="arrowImg">
									<img src="/images/arrowX.svg" />
								</div>
							</div>
						</div>
					</div>
					<div className="caseType">Сайт для строительной компании</div>
					<div className="caseYearBlock">
						<div className="caseYearFrame" />
						<div className="caseYearOverlay" />
						<div className="caseYear">2022</div>
					</div>
					<div className="caseSkillsBlock">
						<div className="caseSkillLine">
							<div className="skillName">MySql</div>
							<div className="skillName">Figma</div>
							<div className="skillName">PS</div>
						</div>
						<div className="caseSkillLine">
							<div className="skillName">HTML</div>
							<div className="skillName">CSS</div>
							<div className="skillName">JavaScript</div>
						</div>
						<div className="skillLeftBorderBlock">
							<div className="skillLeftBorder" />
							<div className="skillLeftBottomBorder" />
							<div className="skillBottomBorder" />
						</div>
					</div>
					<div className="scrollBlock">
						<div className="scrollArrow" />
					</div>
				</div>
				<Case2MoreContent openedCase={openedCase} />
			</div>
		</>
	);
}
