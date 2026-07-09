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

    const color1 = `#3A424A`
    const color2 = `#727980`
    const color3 = `#ADB1B6`
    const color4 = `#D1D5D8`

    return <>
    <div className={openedCase === true ? "caseMoreBlock active" : "caseMoreBlock"} style={openedCase === true ? {height: "0px"} : {}}>
        <div ref={caseMoreContent}className="caseMoreContent case2">
            <div ref={caseBlock1} className="caseBlock caseBlock1 caseRowBlock center">
                <Parallax translateY={[-25, 25]}>
                    <div className="imageBlock bigImage">
                        <video controls={false} playsInline loop muted autoPlay>
                            <source src="/video/case2Video1.mp4" type="video/mp4"/>
                        </video>
                    </div>            
                </Parallax>
                <div className="textBlock bigText">
                    <p>Эффект футуристичности, брутальность и минимализм</p>
                </div>
            </div>
            <div ref={caseBlock2} className="caseBlock caseBlock2 caseRowBlock" >
                <div className="squareBlock">
                    <div className="squareTitle">О клиенте</div>
                    <div className="squareFrame">
                        <div className="squareText">
                            <p>Компания TROOF занимается строительством кровельных систем, в том числе плоских крыш, и гидроизоляцией с использованием современных технологий и материалов мировых брендов с 2016 года. Они смогли построить более 200 000 квадратных метров плоских крыш и более 50 объектов с нестандартными решениями.</p>
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
                            <p>Разработка минималистичного, но при этом футуристичного сайта для премиум аудитории. Нужно погрузить пользователя в контент сайта и удостоверить его в профессионализме компании.</p>
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
                    <p>Клиент: TROOF</p>
                    <p>Веб разработка: LAVAWEB</p>
                </div>
                <div className="synergyRight">
                    <div className="synergyLogo">
                        <img src="/images/case2/troof_logo.svg" />
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
                    Дизайн, подчеркивающий современность компании
                </div>
                <Parallax translateY={[-10, 35]}>
                    <div className="imageBlock bigImage rightImage">
                        <img src="/images/case2/case2Image.webp"/>
                    </div>
                </Parallax>
            </div>
            <div ref={caseBlock5} className="caseBlock caseBlock5 caseColumnBlock paddingBlock fonts">
                <div className="fontsBlock Montserrat">
                    <div className="fontLeftBlock">
                        <div className="fontText">Основной шрифт сайта</div>
                        <div className="fontName">Montserrat</div>
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
                <div className="fontsBlock ST_Norilsk">
                    <div className="fontLeftBlock">
                        <div className="fontText">Интерактивный шрифт</div>
                        <div className="fontName">ST_Norilsk</div>
                    </div>
                    <div className="fontRightBlock">
                        <div className="fontCircle">А</div>
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
                    Искусство и технология, объединенные в единое целое.
                </div>
                <Parallax translateY={["-5vw", "2vw"]}>
                    <div className="imageBlock bigImage">
                        <video controls={false} playsInline loop muted autoPlay>
                            <source src="/video/case2Video2.mp4" type="video/mp4"/>
                        </video>
                    </div>
                </Parallax>
                <div className="squareBlock">
                    <div className="squareTitle">Увлекательный интерактив</div>
                    <div className="squareFrame">
                        <div className="squareText">
                            <p>С помощью визуальных эффектов и анимации показываем пользователям отношение компании ко всему чем они занимаются.</p>
                            <p>Передаем приверженность компании к новым технологиям, современным тенденциям и стилю.</p>
                        </div>
                    </div>
                </div>
            </div>
            <div ref={caseBlock8} className="caseBlock caseBlock8 caseRowBlock paddingBlock spaceBetween" > 
                <div className="leftBlock">
                    <div className="lineBlock leftLineBlock">
                        <div className="lineTitle">Акцент на важном</div>
                        <div className="line" />
                        <div className="lineText">Сайт выделяет важные элементы и информацию, привлекая внимание посетителей. Мы уверены, что первое впечатление имеет решающее значение, и поэтому сосредотачиваем внимание на том, что действительно важно для пользователя.</div>
                    </div>
                    <div className="lineBlock leftLineBlock">
                        <div className="lineTitle">Динамика и минимализм</div>
                        <div className="line" />
                        <div className="lineText">Сайт сочетает в себе два ключевых принципа – динамику и минимализм. Динамичные анимации и переходы придают сайту живость, а в то же время, минималистичный дизайн обеспечивает ясность и удобство использования. Это создает гармоничное визуальное впечатление.</div>
                    </div>
                </div>
                <div className="rightBlock">
                    <div className="lineBlock rightLineBlock">
                        <div className="lineTitle">Уникальный контент</div>
                        <div className="line" />
                        <div className="lineText">Мы знаем, что для того чтобы привлечь и удержать внимание аудитории, нужен уникальный и интересный контент. На сайте предоставлены оригинальные материалы, которые нельзя найти где-либо еще.</div>
                    </div>
                    <div className="lineBlock rightLineBlock">
                        <div className="lineTitle">Эффект "WOW"</div>
                        <div className="line" />
                        <div className="lineText">Мы стремились создать сайт, который вызывает восторг у посетителей.У нас удалось достичь этого эффекта через интерактивные элементы, креативные анимации и едва заметные детали, которые делают посещение сайта незабываемым.</div>
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


