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
    const caseBlock6 = useRef()
    const caseBlock8 = useRef()

    const color1 = `#5C27AC`
    const color2 = `#E41385`
    const color3 = `#FEC424`
    const color4 = `#FFFFFF`

    return <>
    <div className={openedCase === true ? "caseMoreBlock active" : "caseMoreBlock"} style={openedCase === true ? {height: "0px"} : {}}>
        <div ref={caseMoreContent}className="caseMoreContent case5">
            <div ref={caseBlock1} className="caseBlock caseBlock1 caseRowBlock center">
                <Parallax translateY={[-25, 25]}>
                    <div className="imageBlock bigImage">
                        <video controls={false} playsInline loop muted autoPlay>
                            <source src="/video/case5Video1.mp4" type="video/mp4"/>
                        </video>
                    </div>            
                </Parallax>
                <div className="textBlock bigText">
                    <p>{`Просто, но незабываемо, эффективно и забавно :)`}</p>
                </div>
            </div>
            <div ref={caseBlock2} className="caseBlock caseBlock2 caseRowBlock" >
                <div className="squareBlock">
                    <div className="squareTitle">О клиенте</div>
                    <div className="squareFrame">
                        <div className="squareText">
                            <p>RE-EVOLUTION — многофункциональный партнер, предоставляющий комплексное сопровождение в сфере спецпроектов, креативных концепций, продвижения и многого другого, всегда готовый удовлетворить потребности клиентов и добавить креативности в каждый проект.</p>
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
                            <p>{`Разработать информационный сайт-визитку с креативной подачей. Сделать его быстрым, креативным и с медведем :)`}</p>
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
                    <p>Клиент: RE-EVOLUTION</p>
                    <p>Веб разработка: LAVAWEB</p>
                </div>
                <div className="synergyRight">
                    <div className="synergyLogo circle">
                        <img src="/images/case5/case5Logo.svg" />
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
            <div ref={caseBlock8} className="caseBlock caseBlock8 caseRowBlock paddingBlock spaceBetween" > 
                <div className="leftBlock">
                    <div className="lineBlock leftLineBlock">
                        <div className="squareBlock">
                            <div className="squareTitle">Просто и понятно</div>
                            <div className="squareFrame">
                                <div className="squareText">
                                    <p>Сайт отличается простотой и понятностью в использовании. Навигация интуитивна, информация представлена четко и легко доступна. Мы стремились сделать сайт максимально простым и удобным для посетителей.</p>
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
                            <div className="squareTitle">Быстрая загрузка</div>
                            <div className="squareFrame">
                                <div className="squareText">
                                    <p>Одной из наших приоритетных задач было обеспечение мгновенной загрузки страниц сайта. Мы оптимизировали контент и использовали передовые технологии, чтобы сделать загрузку быстрой для всех посетителей.</p>
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
                            <div className="squareTitle">Адаптивность</div>
                            <div className="squareFrame">
                                <div className="squareText">
                                    <p>Наш сайт адаптирован для разных устройств и экранов. Благодаря технологии адаптивного дизайна, сайт корректно отображается как на компьютерах, так и на мобильных устройствах и планшетах.</p>
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


