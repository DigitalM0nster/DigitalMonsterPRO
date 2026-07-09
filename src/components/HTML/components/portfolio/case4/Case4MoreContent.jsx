import { useRef } from "react";
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

    const color1 = `#F15A25`
    const color2 = `#329368`
    const color3 = `#171D1C`
    const color4 = `#FFFFFF`

    return <>
    <div className={openedCase === true ? "caseMoreBlock active" : "caseMoreBlock"} style={openedCase === true ? {height: "0px"} : {}}>
        <div ref={caseMoreContent}className="caseMoreContent case4">
            <div ref={caseBlock1} className="caseBlock caseBlock1 caseRowBlock center">
                <Parallax translateY={[-25, 25]}>
                    <div className="imageBlock bigImage">
                        <video controls={false} playsInline loop muted autoPlay>
                            <source src="/video/case4Video1.mp4" type="video/mp4"/>
                        </video>
                    </div>            
                </Parallax>
                <div className="textBlock bigText">
                    <p>Ассиметрия и беспорядок сделали сайт живым <br /> и интересным</p>
                </div>
            </div>
            <div ref={caseBlock2} className="caseBlock caseBlock2 caseRowBlock" >
                <div className="squareBlock">
                    <div className="squareTitle">О клиенте</div>
                    <div className="squareFrame">
                        <div className="squareText">
                            <p>Компания CRE + Retail - лидеры в сфере брендирования, консультирования и франчайзинга для успешных предприятий в России и Казахстане.</p>
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
                            <p>Разработать сайт для мирового ритейлера, который вдохновляет идеями и выдающейся производительностью. Подчеркнуть динамичность компании и показать её возможности</p>
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
                    <p>Клиент: CRE-RETAIL</p>
                    <p>Веб разработка: LAVAWEB</p>
                </div>
                <div className="synergyRight">
                    <div className="synergyLogo">
                        <img src="/images/case4/case4Logo.png" />
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
                    Сайт стильно раскрывает многогранность возможностей CRE-Retail
                </div>
                <Parallax translateY={[-10, 35]}>
                    <div className="imageBlock bigImage rightImage">
                        <img src="/images/case4/case4Image.webp"/>
                    </div>
                </Parallax>
            </div>
            <div ref={caseBlock5} className="caseBlock caseBlock5 caseColumnBlock paddingBlock fonts">
                <div className="fontsBlock Arial">
                    <div className="fontLeftBlock">
                        <div className="fontText">Основной шрифт сайта</div>
                        <div className="fontName">Arial</div>
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
                <div className="fontsBlock DrukWideCyr">
                    <div className="fontLeftBlock">
                        <div className="fontText">Шрифт для подписи</div>
                        <div className="fontName">DrukWideCyr</div>
                    </div>
                    <div className="fontRightBlock">
                        <div className="fontCircle">Аа</div>
                        <div className="fontLettersColumn">
                            <div className="columnTitle"></div>
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
                    Магия мелких анимаций делает сайт ещё более увлекательным
                </div>
                <Parallax translateY={["-5vw", "2vw"]}>
                    <div className="imageBlock bigImage">
                        <video controls={false} playsInline loop muted autoPlay>
                            <source src="/video/case4Video2.mp4" type="video/mp4"/>
                        </video>
                    </div>
                </Parallax>
                <div className="squareBlock">
                    <div className="squareTitle">Приятные анимации</div>
                    <div className="squareFrame">
                        <div className="squareText">
                            <p>Мелкие, но утонченные анимации сайта придают ему уникальный и захватывающий характер, внося непередаваемую игровую динамику в пользовательский опыт. Эти небольшие детали делают использование сайта еще более увлекательным и приятным для всех посетителей.</p>
                        </div>
                    </div>
                </div>
            </div>
            <div ref={caseBlock8} className="caseBlock caseBlock8 caseRowBlock paddingBlock spaceBetween" > 
                <div className="leftBlock">
                    <div className="lineBlock leftLineBlock">
                        <div className="squareBlock">
                            <div className="squareTitle">Интересный контент</div>
                            <div className="squareFrame">
                                <div className="squareText">
                                    <p>Страницы буквально дышат интересным контентом, предлагая уникальные видеоматериалы и графику, которые погружают посетителей в увлекательные мероприятия и события.</p>
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
                            <div className="squareTitle">Передача эмоций</div>
                            <div className="squareFrame">
                                <div className="squareText">
                                    <p>Контент рассчитан не только на разум, но и на эмоции. Мы стремимся вдохновлять, удивлять и вызывать чувства у пользователей сайта.</p>
                                </div>
                                <div className="squareLinesBlock">
                                    <div className="squareLineLeft" />
                                    <div className="squareLineRight" />
                                    <div className="squareLineBottom" />
                                    2
                                </div>
                            </div>
                        </div>
                        <div className="squareBlock">
                            <div className="squareTitle">Широкий спектр услуг</div>
                            <div className="squareFrame">
                                <div className="squareText">
                                    <p>Мы максимально полно и подробно представили весь многофункциональный спектр услуг, охватывая каждый аспект деятельности, чтобы пользователи сайта могли найти именно то, что им нужно.</p>
                                </div>
                                <div className="squareLinesBlock">
                                    <div className="squareLineLeft" />
                                    <div className="squareLineRight" />
                                    <div className="squareLineBottom" />
                                    3
                                </div>
                            </div>
                        </div>
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


