import DigitalMonsterLoader from "./DigitalMonsterLoader";

export default function LoaderComponent(props) {
	return (
		<div className={props.startApp ? `loadingScreen startApp` : `loadingScreen`}>
			<div className="blockMain blockMainL">
				<div className="block block1" />
				<div className="block block2" />
				<div className="block block3" />
				<div className="block block4" />
				<div className="block block5" />
				<div className="block block6" />
				<div className="block block7" />
			</div>
			<DigitalMonsterLoader
				activeLoader={props.activeLoader}
				rendered={props.rendered}
				setStartApp={props.setStartApp}
				startApp={props.startApp}
			/>
		</div>
	);
}
