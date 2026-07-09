import { useEffect, useRef } from "react";
import { useStore } from "@/store.jsx";
import { Parallax } from 'react-scroll-parallax';

export default function Case1MoreContent(props) {   
    const store = useStore();
    const openedCase = props.openedCase

    const caseMoreContent = useRef()

    const caseBlock1 = useRef()
    const caseBlock2 = useRef()
    const caseBlock3 = useRef()
    const caseBlock4 = useRef()
    const caseBlock5 = useRef()
    const caseBlock6 = useRef()
    const caseBlock7 = useRef()
    const caseBlock8 = useRef()

    const color1 = `#008890`
    const color2 = `#008C95`
    const color3 = `#7AB715`
    const color4 = `#FFFFFF`

    return <>
    <div className={openedCase === true ? "caseMoreBlock active" : "caseMoreBlock"} style={openedCase === true ? {height: "0px"} : {}}>
        <div ref={caseMoreContent}className="caseMoreContent case1">
            <div ref={caseBlock1} className="caseBlock caseBlock1 caseRowBlock center">
                {/* <Parallax translateY={[-25, 25]}> */}
                    <div className="imageBlock bigImage">
                        <video controls={false} playsInline loop muted autoPlay>
                            <source src="/video/case1Video1_720.mp4" type="video/mp4"/>
                        </video>
                    </div>            
                {/* </Parallax> */}
                <div className="textBlock bigText">
                    <p>Дизайн сайта отражает высокую технологичность компании</p>
                </div>
            </div>
            <div ref={caseBlock2} className="caseBlock caseBlock2 caseRowBlock" >
                <div className="squareBlock">
                    <div className="squareTitle">О клиенте</div>
                    <div className="squareFrame">
                        <div className="squareText">
                            <p>НИПИГАЗ — ведущий российский центр по управлению проектированием, поставками, логистикой и строительством. Входит в состав СИБУРа — крупнейшей в России интегрированной нефтехимической компании.</p>
                        </div>
                        <div className="squareLinesBlock">
                            <div className="squareLineLeft" />
                            <div className="squareLineRight" />
                            <div className="squareLineBottom" />
                            1
                        </div>
                    </div>
                </div>
                <div className="squareBlock">
                    <div className="squareTitle">Цель проекта</div>
                    <div className="squareFrame">
                        <div className="squareText">
                            <p>Отразить богатое наследие компании, ее развитие и достижения за все эти годы. Мы хотели показать не только технические достижения, но и истории людей - основателей компании, ключевых сотрудников и трудовых династий, которые создавали ее величие.</p>
                        </div>
                        <div className="squareLinesBlock">
                            <div className="squareLineLeft" />
                            <div className="squareLineRight" />
                            <div className="squareLineBottom" />
                            2
                        </div>
                    </div>
                </div>
            </div>
            <div ref={caseBlock3} className="caseBlock caseBlock3 caseRowBlock synergy">
                <div className="synergyLeft">
                    <p>Клиент: НИПИГАЗ</p>
                    <p>Веб разработка: LAVAWEB</p>
                    <p>Продакшн: BELKA PRODUCTION</p>
                </div>
                <div className="synergyRight">
                    <div className="synergyLogo circleLogo">
                        <img src="/images/case1/logo1.webp" />
                    </div>
                    <div className="cross">
                        <div className="crossLine" />
                        <div className="crossLine" />
                        <div className="crossLine" />
                        <div className="crossLine" />
                    </div>
                    <div className="synergyLogo">
                        <img src="/images/case1/logo3.svg" />
                    </div>
                    <div className="cross">
                        <div className="crossLine" />
                        <div className="crossLine" />
                        <div className="crossLine" />
                        <div className="crossLine" />
                    </div>
                    <div className="synergyLogo circleLogo">
                        <img src="/images/case1/logo2.webp" />
                    </div>
                </div>
            </div>
            <div ref={caseBlock4} className="caseBlock caseBlock4 caseRowBlock paddingBlock rightImageBlock center">
                <div className="textBlock bigText" >
                    Изучая историю НИПИГАЗа, мы выделили на сайте основные ценности, из которых строится основа ее успеха.
                </div>
                <Parallax translateY={[-10, 35]}>
                    <div className="imageBlock bigImage rightImage">
                        <img src="/images/case1/bigImage.webp"/>
                    </div>
                </Parallax>
            </div>
            <div ref={caseBlock5} className="caseBlock caseBlock5 caseColumnBlock paddingBlock fonts">
                <div className="fontsBlock DINPro">
                    <div className="fontLeftBlock">
                        <div className="fontText">Основной шрифт сайта</div>
                        <div className="fontName">DIN PRO</div>
                    </div>
                    <div className="fontRightBlock">
                        <div className="fontCircle">Aa</div>
                        <div className="fontLettersColumn">
                            <div className="columnTitle">Regular</div>
                            <div className="columnLettersBlock">
                                <div className="columnBigLetters">а б в г д е ё ж з и й к л м н о п р с т у ф х ц ч ш щ ъ ы ь э ю я</div>
                                <div className="columnLittleLetters">а б в г д е ё ж з и й к л м н о п р с т у ф х ц ч ш щ ъ ы ь э ю я</div>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="fontsBlock laptev">
                    <div className="fontLeftBlock">
                        <div className="fontText">Шрифт для подписи</div>
                        <div className="fontName">Лаптев</div>
                    </div>
                    <div className="fontRightBlock">
                        <div className="fontCircle">Аа</div>
                        <div className="fontLettersColumn">
                            <div className="columnTitle">Regular</div>
                            <div className="columnLettersBlock">
                                <div className="columnBigLetters">а б в г д е ё ж з и й к л м н о п р с т у ф х ц ч ш щ ъ ы ь э ю я</div>
                                <div className="columnLittleLetters">а б в г д е ё ж з и й к л м н о п р с т у ф х ц ч ш щ ъ ы ь э ю я</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div ref={caseBlock6} className="caseBlock caseBlock6 caseRowBlock paddingBlock colors case1">
                <div className="colorBlock">
                    <div className="colorNumber">{color1}</div>
                    <div className="colorTable">
                        <div className="color1" style={{background: color1}}></div>
                        <div className="color2" style={{background: color1, opacity: "0.5"}}></div>
                    </div>
                </div>
                <div className="colorBlock">
                    <div className="colorNumber">{color2}</div>
                    <div className="colorTable">
                        <div className="color1" style={{background: color2}}></div>
                        <div className="color2" style={{background: color2, opacity: "0.5"}}></div>
                    </div>
                </div>
                <div className="colorBlock">
                    <div className="colorNumber">{color3}</div>
                    <div className="colorTable">
                        <div className="color1" style={{background: color3}}></div>
                        <div className="color2" style={{background: color3, opacity: "0.5"}}></div>
                    </div>
                </div>
                <div className="colorBlock">
                    <div className="colorNumber">{color4}</div>
                    <div className="colorTable">
                        <div className="color1" style={{background: color4}}></div>
                        <div className="color2" style={{background: color4, opacity: "0.5"}}></div>
                    </div>
                </div>
            </div>
            <div ref={caseBlock7} className="caseBlock caseBlock7 caseRowBlock paddingBlock rightImageBlock videoBlock">
                <div className="textBlock bigText">
                    Погружение пользователя в научно-фантастический мир
                </div>
                <Parallax translateY={["-5vw", "2vw"]}>
                    <div className="imageBlock bigImage">
                        <video controls={false} playsInline loop muted autoPlay>
                            <source src="/video/case1Video2_720.mp4" type="video/mp4"/>
                        </video>
                    </div>
                </Parallax>
                <div className="squareBlock">
                    <div className="squareTitle">Интерактивный запуск сайта</div>
                    <div className="squareFrame">
                        <div className="squareText">
                            <p>При скролле сайта с помощью параллакса происходит захватывающий визуальный эффект, который заставляет элементы сайта приближаться к пользователю, словно он находится в центре всего происходящего.</p>
                            <p>Это создает потрясающую эффектность страницы, которая привлекает внимание и запоминается пользователю своей уникальностью.</p>
                        </div>
                    </div>
                </div>
            </div>
            <div ref={caseBlock8} className="caseBlock caseBlock8 caseRowBlock paddingBlock spaceBetween" > 
                <div className="leftBlock">
                    <div className="lineBlock leftLineBlock">
                        <div className="lineTitle">Принципы успеха</div>
                        <div className="line" />
                        <div className="lineText">Изучая историю НИПИГАЗа, мы выделили для демонстрации на сайте три основные ценности, из которых строится основа ее успеха. Ключевые информационные блоки включают в себя историю, достижения и сотрудников.</div>
                    </div>
                    <div className="lineBlock leftLineBlock">
                        <div className="lineTitle">История достижений</div>
                        <div className="line" />
                        <div className="lineText">"Мы гордимся" - в этом разделе на сайте описаны значимые реализованные и реализуемые проекты. Каждый проект по своему амбициозен, стоит большого труда и годы разработок. Инновации и собственные разработки, постоянное развитие компании и бизнес-процессов.</div>
                    </div>
                </div>
                <div className="rightBlock">
                    <div className="lineBlock rightLineBlock">
                        <div className="lineTitle">История развития</div>
                        <div className="line" />
                        <div className="lineText">Исторические вехи развития компании, важные даты и события - все это отражено в ее истории. Компания  гордится своим прошлым и тем сложным путем, который она прошла, начиная от СССР и продолжая развиваться уже в современной России. 
                        История НИПИГАЗа - это история становления сильного бренда и одного из ведущих лидеров отрасли.</div>
                    </div>
                    <div className="lineBlock rightLineBlock">
                        <div className="lineTitle">Семейные династии</div>
                        <div className="line" />
                        <div className="lineText">За 50 лет компании выросли поколения сотрудников. Когда-то еще детьми они слушали рассказы про работу в компании НИПИГАЗ, а сейчас сами являются частью этого большого коллектива! Занимая различные должности и выполняя разного рода задачи, они продолжают дело своих родителей и строят основу для будущих поколений.</div>
                    </div>
                </div>
            </div>

            <div className="gridLines">
                <div className="hLines" style={{opacity: Math.min(store.scroll * 2, 1)}}>
                    <div className="hLine" style={{top: `${store.scroll * 0}%`}} />
                    <div className="hLine" style={{top: `${store.scroll * 30}%`}} />
                    <div className="hLine" style={{top: `${store.scroll * 80}%`}} />
                    <div className="hLine" style={{top: `${store.scroll * 100}%`}} />
                </div>
            </div>
            
        </div>
    </div>
    </>
}


