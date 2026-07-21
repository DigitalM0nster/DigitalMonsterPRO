import DigitalMonsterLoader from "./DigitalMonsterLoader";
import { bindMediaElementToMasterBus } from "@/sounds/masterAudioBus.js";
import { SOUND_CATALOG } from "@/sounds/soundCatalog.js";
import { useEffect, useRef } from "react";

export default function LoaderComponent(props) {
	const startAppRef = useRef(null);

	useEffect(() => {
		const audio = new Audio(SOUND_CATALOG.start_app);
		bindMediaElementToMasterBus(audio);
		startAppRef.current = audio;
	}, []);

	useEffect(() => {
		if (props.startApp === true && startAppRef.current) {
			startAppRef.current.play();
		}
	}, [props.startApp]);


    return  <div className={props.startApp ? `loadingScreen startApp` : `loadingScreen`}>
        <div className="blockMain blockMainL">
            <div className="block block1" />
            <div className="block block2" />
            <div className="block block3" />
            <div className="block block4" />
            <div className="block block5" />
            <div className="block block6" />
            <div className="block block7" />
        </div>
        <DigitalMonsterLoader activeLoader={props.activeLoader} rendered={props.rendered} setStartApp={props.setStartApp} startApp={props.startApp} />
    </div>
}
