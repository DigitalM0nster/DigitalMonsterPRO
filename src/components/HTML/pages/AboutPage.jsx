import { Routes, Route, useLocation, useNavigate } from "react-router-dom"
import { requestHexNavigation } from "@/utils/hexNavigation.js"
import ContentYear from "../components/about/ContentYear.jsx"
import { useStore } from "@/store.jsx"
import { usePageStateClasses } from "@/context/RouteTransitionContext.jsx"

export default function AboutPage() {
    const store = useStore()
    const pageClassName = usePageStateClasses("about")
    const navigate = useNavigate()
    const location = useLocation()
    const href = location.pathname.split('/')[2]
    function changeLocation(_to, newLocation) {
        if (location.pathname != newLocation) {
            if (requestHexNavigation(newLocation, location.pathname)) {
                return
            }
            navigate(newLocation)
        }
    }

    let contentYearContent = [
        {
            year: "2016 - 2018",
            spans: [
                    `2016 (Consilium Creative) - Начало формирования креативного агентства (Разработка рекламных видеороликов для наружных коммуникаций в г. Волжский (Волгоградская область) для региональных компаний.`
                    ,
                     `2017-2018 (Repin&Mushich) Плотная разработка motion-графики для федеральных креативных агентств в статусе субподрядчика. 
                        Первый опыт работы с проектами для крупных Российских компаний и мировых брендов.`
                    ,
                    `2018 (SPHERE DIGITAL) Отделение от видеопродакшена в сторону web-разработки. Начало самого сложного процесса формирования команды, студии с нуля.
                    За пол года была собрана первая команда: на аутсорсе работало 6 человек, а в штате - 1 дизайнер.`
            ]
        },
        {
            year: "2019 - 2020",
            spans: [
                    `В 2019 году начался ковид, в мире паника и суета, многие проекты начали слетать, многие клиенты начали отказываться от своих планов и дальнейшей работы с нами.`
                    ,
                    `Мы переключили внимание с ниш, которые в просадке. Пока другие паникуют, мы для себя принимаем стратегию смотреть шире и искать возможности.
                    Сфокусировались на тех, кто работает исключительно в онлайне или готовится к запуску онлайн-проектов, не связанных с оффлайн точками.
                    Мы поняли, что сейчас очень многие толковые ребята будут искать работу. А так как у нас были опыт и навыки, мы смогли бы их взять и подтянуть в нужных для нас сферах, тем самым снизить стоимость работ и повысить количество проектов (таким образом мы уровняли прибыль и пережили эти сложные времена).
                    Как итог - кратный рост за 2 года во всех отношениях.`
            ]
        },
        {
            year: "2021 - 2022",
            spans: [
                    `Этот период был связан для нас с экспериментами, новыми нишами и крипто-проектами. 
                    В середине 2021 года нам предложили принять участие в разработке игры на блокчейне.`
                    ,
                    `Мы влились в работу с другими программистами, которые делали уже второй подобный крипто-проект. После ухода тимлида из проекта, управление проектом по большей части стало принадлежать нашей команде, и за 9 месяцев мы смогли разработать и запустить свой продукт, продвинуть его и найти небольшие инвестиции.`
                    ,
                    `Игра входила в ТОП 10 игр на блокчейне WAX по версии онлайн-портала NFT HORIZON (7 место).`
                    ,
                    `В связи событиями в 2022 году вся крипта, NFT игры и прочие, связанные с криптой вещи, стремительно полетели вниз. За 9 месяцев работы нам удалось отбить вложения инвестора + 20% сверху, оплатить работы всем членам команды и самим заработать несколько тысяч долларов. Мы приняли решение больше не лезть в эту сферу и делать то, что мы умеем лучше всего - это стало нашим главным приоритетом. Да, на разработке NFT-игр мы не заработали себе на дома в Арабских эмиратах, НО максимально усилили нашу команду крутыми сотрудниками!`
            ]
        },
        {
            year: "2023",
            spans: [
                    `У нас есть отличная команда, с которой приятно идти вперед, развиваться и, самое главное - делать максимальный результат для компаний, которые нам доверяют.`
                    ,
                    `На данный момент мы работаем с несколькими крупными компаниями на поддержке. Решаем приходящие задачи от нескольких гос. структур и занимаемся поддержкой прошлых проектов.`
                    ,
                    `НО! Для нас особо ценнен опыт работы с компаниями, которые амбициозны и голодны на прорывные, инновационные идеи и эксперименты.`
            ]
        }
    ]

    return <>
    
        <div className={pageClassName}>
            <div className="topContainer">
                <div className="topRightPanel">
                    <div className="lavaLogoPanel">
                        <img src="/images/DM_logo.png" alt="DigitalMonster" />
                    </div>
                    <div className="topRightPanelTitle">
                            Наша история
                    </div>
                </div>
                <div className="topNavigationPanel historyNavigation">
                    <div className={href == undefined ? `caseCountBlock n1 active` : `caseCountBlock n1`}
                    onPointerEnter={() => {store.cursor.hovered = true}}
                    onPointerLeave={() => {store.cursor.hovered = false}}
                    >
                        <div className="caseCount" onClick={ (e) => { changeLocation(``, '/about'); } }>
                            <div className="caseNumber">2016 - 2018</div>
                        </div>
                    </div>
                    <div className="caseLine n1"></div>
                    <div className={href == `2019-2020` ? `caseCountBlock n2 active` : `caseCountBlock n2`}
                    onPointerEnter={() => {store.cursor.hovered = true}}
                    onPointerLeave={() => {store.cursor.hovered = false}}
                    >
                        <div className="caseCount" onClick={ (e) => { changeLocation(`2019-2020`, '/about/2019-2020'); } }>
                            <div className="caseNumber">2019 - 2020</div>
                        </div>
                    </div>
                    <div className="caseLine n2"></div>
                    <div className={href == `2021-2022` ? `caseCountBlock n3 active` : `caseCountBlock n3`}
                    onPointerEnter={() => {store.cursor.hovered = true}}
                    onPointerLeave={() => {store.cursor.hovered = false}}
                    >
                        <div className="caseCount" onClick={ (e) => { changeLocation(`2021-2022`, '/about/2021-2022'); } }>
                            <div className="caseNumber">2021 - 2022</div>
                        </div>
                    </div>
                    <div className="caseLine n3"></div>
                    <div className={href == `2023` ? `caseCountBlock n4 active` : `caseCountBlock n4`}
                    onPointerEnter={() => {store.cursor.hovered = true}}
                    onPointerLeave={() => {store.cursor.hovered = false}}
                    >
                        <div className="caseCount" onClick={ (e) => { changeLocation(`2023`, '/about/2023'); } }>
                            <div className="caseNumber">2023</div>
                        </div>
                    </div>
                </div>
            </div>
            <div className="aboutUsBlock">
                <div className="aboutContentBlock">
                    <Routes location={location}>
                        <Route index element={<ContentYear {...contentYearContent[0]} />} />
                        <Route path="2019-2020" element={<ContentYear {...contentYearContent[1]} />} />
                        <Route path="2021-2022" element={<ContentYear {...contentYearContent[2]} />} />
                        <Route path="2023" element={<ContentYear {...contentYearContent[3]} />} />
                    </Routes>
                </div>
            </div>
        </div>

    </>
}
