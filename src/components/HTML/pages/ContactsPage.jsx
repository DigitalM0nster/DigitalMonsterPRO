import { useStore } from "@/store"
import { usePageStateClasses } from "@/context/RouteTransitionContext.jsx"

export default function ContactsPage() {
    const store = useStore()
    const pageClassName = usePageStateClasses("contacts")
    return <>
        <div className={pageClassName}>
            <div className="contactsContainer">
                <div className="contactsContain">
                    <div className="logoBlock">
                        <img src="/images/DM_logo.png" alt="DigitalMonster" />
                    </div>
                    <div className="contactsPerson">
                        <div className="contactsWho">Валентин</div>
                        <div className="contactsDescription">Разработка <br />и поддержка</div>
                        <div className="contactsContacts">
                            <div className="personSocials">
                                <a href="https://t.me/Valentin_DigitalMonster" target="_blank" className="socialIcon" 
                                onPointerEnter={() => {store.cursor.hovered = true}}
                                onPointerLeave={() => {store.cursor.hovered = false}}
                                >
                                    <img src="/images/tg_icon.svg" alt="DigitalMonster telegram" />
                                </a>
                                <a href="mailto:valentin@digitalmonster.ru" target="_blank" className="socialIcon" 
                                onPointerEnter={() => {store.cursor.hovered = true}}
                                onPointerLeave={() => {store.cursor.hovered = false}}
                                >
                                    <img src="/images/mailIcon.png" alt="DigitalMonster email" />
                                </a>
                            </div>
                            <a href="tel:+79954091882" target="_blank"
                            onPointerEnter={() => {store.cursor.hovered = true}}
                            onPointerLeave={() => {store.cursor.hovered = false}}
                            >{"+7 (995) 409 18 82"}</a>
                        </div>
                    </div>
                    <div className="lineSeparator"/>
                    <div className="contactsPerson">
                        <div className="contactsWho">Владимир</div>
                        <div className="contactsDescription">Сотрудничество <br />и медиа</div>
                        <div className="contactsContacts">
                            <div className="personSocials">
                                <a href="https://t.me/Vladimir_Rush" target="_blank" className="socialIcon" 
                                onPointerEnter={() => {store.cursor.hovered = true}}
                                onPointerLeave={() => {store.cursor.hovered = false}}
                                >
                                    <img src="/images/tg_icon.svg" alt="DigitalMonster telegram" />
                                </a>
                                <a href="mailto:vlrush@digitalmonster.ru" target="_blank" className="socialIcon" 
                                onPointerEnter={() => {store.cursor.hovered = true}}
                                onPointerLeave={() => {store.cursor.hovered = false}}
                                >
                                    <img src="/images/mailIcon.png" alt="DigitalMonster email" />
                                </a>
                            </div>
                            <a href="tel:+79692940340" target="_blank"
                            onPointerEnter={() => {store.cursor.hovered = true}}
                            onPointerLeave={() => {store.cursor.hovered = false}}
                            >{"+7 (969) 294 03 40"}</a>
                        </div>
                    </div>
                </div>
                <div className="contactsSocials">
                    <div className="digitalMonsterText">соц. сети</div>
                    <div className="socialsBlock">
                        <a href="https://t.me/digitalmonsterteam" target="_blank" className="socialIcon" 
                        onPointerEnter={() => {store.cursor.hovered = true}}
                        onPointerLeave={() => {store.cursor.hovered = false}}
                        >
                            <img src="/images/tg_icon.svg" alt="DigitalMonster telegram" />
                        </a>
                        <a href="https://www.behance.net/VLRUSH" target="_blank" className="socialIcon" 
                        onPointerEnter={() => {store.cursor.hovered = true}}
                        onPointerLeave={() => {store.cursor.hovered = false}}
                        >
                            <img src="/images/behance_icon.svg" alt="DigitalMonster Behance" />
                        </a>
                    </div>
                    {/* <div className="socialIcon" 
                    onPointerEnter={() => {store.cursor.hovered = true}}
                    onPointerLeave={() => {store.cursor.hovered = false}}
                    >
                        <img src="/images/youtube_icon.svg" alt="DigitalMonster YouTube" />
                    </div> */}
                </div>
                <div className="cityBlock">Volgograd | Russia</div>
            </div>
        </div>
    </>
}
