export default function ContentYear(props){
    return <>
    <div className="aboutContent">
        <div className="aboutTitle">{props.year}</div>
        <div className="aboutTextBlock">
            <>
                {
                    props.spans.map((spanText, i) => {
                        return <span key={`(${props.year}) key: ${i}`}>{spanText}</span>
                    })
                }
            </>
        </div>
        <div className="achievmentsBlock"></div>
    </div>
    </>
}