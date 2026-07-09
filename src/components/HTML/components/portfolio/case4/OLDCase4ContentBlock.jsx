import { useStore } from "@/store"

export default function Case4ContentBlock(props){

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
                <div className="caseTitle">CRE-Retail group</div>
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
            <div className="caseType">Cайт для ритейлера</div>
            <div className="caseYearBlock">
                <div className="caseYear">2022</div>
            </div>
            <div className="caseDescription">
                <span>Сотрудничаем с Натальей - основателем этой и многих других успешных компаний уже около 3-ех лет. Помогаем с разработкой сайтов, а также консультируем по вопросам онлайн сервисов для мероприятий в крупнейших торговых центрах России.</span>
                <span>Мы продумали весь интерфейс и пользовательский опыт, каждая мелочь продумана для удобства пользования на всех устройствах.</span>
            </div>
            <div className="caseSkillsBlock">
                <div className="caseSkillLine">
                    <div className="skillName">Figma</div>
                    <div className="skillName">PS</div>
                </div>
                <div className="caseSkillLine">
                    <div className="skillName">HTML</div>
                    <div className="skillName">CSS</div>
                    <div className="skillName">JavaScript</div>
                </div>
                <div className="skillLeftBorderBlock">
                    <div className="skillLeftBorder"></div>
                </div>
            </div>
        </div>
    </div>
    </>
}