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

    const color1 = `#1C1F2A`
    const color2 = `#FF5000`
    const color3 = `#D0D0CE`
    const color4 = `#FFFFFF`

    return <>
    <div className={openedCase === true ? "caseMoreBlock active" : "caseMoreBlock"} style={openedCase === true ? {height: "0px"} : {}}>
        <div ref={caseMoreContent}className="caseMoreContent case3">
            <div ref={caseBlock1} className="caseBlock caseBlock1 caseRowBlock center">
                <Parallax translateY={[-25, 25]}>
                    <div className="imageBlock bigImage">
                        <img src="/images/case3/case3Block1Image.webp" />
                    </div>            
                </Parallax>
                <div className="textBlock bigText">
                    <p>современный сайт <br/>по аренде башенных кранов </p>
                </div>
            </div>
            <div ref={caseBlock2} className="caseBlock caseBlock2 caseRowBlock" >
                <div className="squareBlock">
                    <div className="squareTitle">О клиенте</div>
                    <div className="squareFrame">
                        <div className="squareText">
                            <p>Компания по сдаче в аренду башенных кранов для строительных компаний в Москве и Московской области.</p>
                            <p>ММК-1 - не только сдаёт технику в аренду, но и обеспечивает комфорт для клиента от первого общения и до окончания работ.</p>
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
                            <p>Разработать современный сайт с элементами, которые запомнятся пользователю. Сайт, который не только даст пользователю нужную информацию, но и подарит эмоции. Сайт на котором хочется оформить заказ.</p>
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
                    <p>Клиент: ММК-1</p>
                    <p>Веб разработка: LAVAWEB</p>
                </div>
                <div className="synergyRight">
                    <div className="synergyLogo">
                        <img src="/images/case3/logoMMK1.svg" />
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
                </div>
            </div>
            <div ref={caseBlock4} className="caseBlock caseBlock4 caseRowBlock paddingBlock rightImageBlock center">
                <div className="textBlock bigText" >
                Классический бизнес <br /> может заиграть новыми<br /> красками и эмоциями
                </div>
                <Parallax translateY={[-10, 35]}>
                    <div className="imageBlock bigImage rightImage">
                        <img src="/images/case3/case3BigImage.webp"/>
                    </div>
                </Parallax>
            </div>
            <div ref={caseBlock5} className="caseBlock caseBlock5 caseColumnBlock paddingBlock fonts">
                <div className="fontsBlock Manifold">
                    <div className="fontLeftBlock">
                        <div className="fontText">Основной шрифт сайта</div>
                        <div className="fontName">Manifold</div>
                    </div>
                    <div className="fontRightBlock">
                        <div className="fontCircle">Aa</div>
                        <div className="fontLettersColumn">
                            <div className="columnTitle">Regular</div>
                            <div className="columnLettersBlock">
                                <div className="columnBigLetters">а б в г д е ё ж з и й к л м н о п р с т у ф х ц ч ш щ ъ ы ь э ю я</div>
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
                    Помимо разразработки сайта, <br />
                    сделали логотип компании
                </div>
                <Parallax translateY={["-5vw", "2vw"]}>
                    <div className="imageBlock bigImage">
                        <img src="/images/case3/case3Block7Image.png" />
                    </div>
                </Parallax>
                <div className="squareBlock">
                    <div className="squareTitle">Идея дизайна для логотипа</div>
                    <div className="squareFrame">
                        <div className="squareText">
                            <p>В качестве основной идеи был взят крюк строительного крана + цифра 1 из названия компании, которая передает стремление быть лучшими в своем деле</p>
                        </div>
                    </div>
                </div>
            </div>
            <div ref={caseBlock8} className="caseBlock caseBlock8 caseRowBlock paddingBlock spaceBetween" > 
                <div className="leftBlock">
                    <div className="lineBlock leftLineBlock">
                        <div className="lineTitle">С первой же секунды</div>
                        <div className="line" />
                        <div className="lineText">Когда вы впервые открываете сайт, вы моментально погружаетесь в впечатляющую интерактивную 3д сцену. Это не только приковывает ваше внимание, но и мгновенно передает ключевое сообщение: в этой компании стремятся к самому высокому уровню.</div>
                    </div>
                    <div className="lineBlock leftLineBlock">
                        <div className="lineTitle">Просто и удобно</div>
                        <div className="line" />
                        <div className="lineText">Создана интуитивно понятная система аренды, позволяющая легко выбирать подходящее оборудование. Наш фильтр по ключевым характеристикам и удобный поиск по объектам делают процесс выбора быстрым и эффективным. Карточки объектов аренды дополнительно продуманы, чтобы предоставить максимально полезную информацию.</div>
                    </div>
                </div>
                <div className="rightBlock">
                    <div className="lineBlock rightLineBlock">
                        <div className="lineTitle">Адаптивно и стабильно</div>
                        <div className="line" />
                        <div className="lineText">Наша разработка ориентирована на максимальное удовлетворение потребностей пользователей независимо от устройства. Мы активно тестируем и оптимизируем сайт для разных разрешений экранов, уделяя этому особое внимание.</div>
                    </div>
                    <div className="lineBlock rightLineBlock">
                        <div className="lineTitle">Всё необходимое сразу</div>
                        <div className="line" />
                        <div className="lineText">В карточки товаров мы нативно интегрировали предоставляемые услуги. Это позволяет пользователям не только выбрать нужный кран, но и увидеть дополнительные услуги, которые действительно могут пригодиться. Всегда удобнее, когда тебе предоставляют всё необходимое в одном месте.</div>
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


