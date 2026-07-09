import { useStore } from "@/store"

export default function Case2ContentBlock(props){

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
                <div className="caseTitle">Troof</div>
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
            <div className="caseType">Сайт для строительной компании</div>
            <div className="caseYearBlock">
                <div className="caseYear">2022</div>
            </div>
            <div className="caseDescription">
                <span>Разработка сайта для премиум аудитории. Задачей было сделать сайт минималистичным и футуристичным.</span>
                <span>Анимации на сайте добавили минимализму динамики и сосредаточили акцент на ключевых товарах / услугах / информации.</span>
                <span>Современный дизайн в серых минималистичных тонах создал эффект футуристичности.</span>
                <span>В совокупности это всё создаёт эффект "wow!" и привлекает премиум аудиторию.</span>
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
                    <div className="skillLeftBorder"></div>
                </div>
            </div>
        </div>
    </div>
    </>
}