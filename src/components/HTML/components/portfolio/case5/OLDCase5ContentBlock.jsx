import { useStore } from "@/store"

export default function Case5ContentBlock(props){

    const store = useStore()
    return <>
    <div className="caseContentBlock">
        <div className="caseStartBlock">
            <div className="caseTitleButton">
                <div className="caseButton back"
                onClick={() => {
                    document.querySelector('.caseOverlay').classList.remove('active')
                    store.openedCase = false
                }}>
                    <div className="caseButtonArrowBlock back">
                        <div className="arrowImg">
                            <img src="/images/arrowX.svg" />
                        </div>
                        <div className="arrowLine"></div>
                    </div>
                    <div className="caseButtonText">Закрыть</div>
                    <div className="caseButtonLineBlock back"></div>
                </div>
                <div className="caseTitle">Re-Evolution</div>
                <div className="caseButton"
                    onClick={() => {
                        document.querySelector('.caseOverlay').classList.add('active')
                        store.openedCase = true
                    }}
                >
                    <div className="caseButtonLineBlock"></div>
                    <div className="caseButtonText">Подробнее</div>
                    <div className="caseButtonArrowBlock">
                        <div className="arrowLine"></div>
                        <div className="arrowImg">
                            <img src="/images/arrowX.svg" />
                        </div>
                    </div>
                </div>
            </div>
            <div className="caseType">Сайт визитка</div>
            <div className="caseYearBlock">
                <div className="caseYear">2022</div>
            </div>
            <div className="caseDescription">
                <span>Информационный сайт-визитка с креативной подачей.</span>
                <span>{`Быстрый, Креативный и с медведем :)`}</span>
            </div>
            <div className="caseSkillsBlock">
                <div className="caseSkillLine">
                    <div className="skillName">Figma</div>
                    <div className="skillName">Tilda</div>
                    <div className="skillName">PS</div>
                </div>
                <div className="caseSkillLine">
                    <div className="skillName">HTML</div>
                    <div className="skillName">CSS</div>
                </div>
                <div className="skillLeftBorderBlock">
                    <div className="skillLeftBorder"></div>
                </div>
            </div>
        </div>
    </div>
    </>
}