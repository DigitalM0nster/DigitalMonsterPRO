export const MMK1_CAMERA_HOTSPOTS = [
	{
		id: "mmk1-point-01",
		label: {
			ru: ["СТРЕЛА", "РАБОЧИЙ ВЫЛЕТ КРАНА"],
			en: ["JIB", "THE CRANE'S WORKING REACH"],
			zh: ["起重臂", "起重机的作业范围"],
		},
		point: [-0.0016, 3.0024, 1.5019],
		camera: {
			position: [-0.2618, 3.685, 2.8754],
			quaternion: [0.155816, 0.245484, 0.040013, -0.955959],
			fov: 49,
		},
	},
	{
		id: "mmk1-point-02",
		labelPlacement: "left",
		label: {
			ru: ["КАБИНА ОПЕРАТОРА", "ЦЕНТР УПРАВЛЕНИЯ КРАНОМ"],
			en: ["OPERATOR CAB", "THE CRANE'S CONTROL POINT"],
			zh: ["操作室", "起重机的控制中心"],
		},
		point: [5.2967, 3.064, -0.4534],
		craneRotationDeg: -132.4,
		camera: {
			position: [5.0128, 3.1303, -0.2956],
			quaternion: [-0.13303, 0.404253, 0.059557, 0.902959],
			fov: 49,
		},
	},
	{
		id: "mmk1-point-03",
		label: {
			ru: ["КРЮКОВОЙ БЛОК", "ТОЧКА ПОДЪЁМА ГРУЗА"],
			en: ["HOOK BLOCK", "WHERE THE LOAD CONNECTS"],
			zh: ["吊钩组", "连接并提升载荷"],
		},
		point: [2.6269, 1.7855, 0.4182],
		camera: {
			position: [2.0424, 1.8698, 1.5094],
			quaternion: [-0.067124, 0.267201, -0.018661, -0.961119],
			fov: 49,
		},
	},
	{
		id: "mmk1-point-04",
		labelPlacement: "left",
		label: {
			ru: ["ПРОТИВОВЕС", "БАЛАНС КОНСТРУКЦИИ"],
			en: ["COUNTERWEIGHT", "BALANCING THE STRUCTURE"],
			zh: ["配重", "保持结构平衡"],
		},
		point: [7.5271, 2.9323, -1.3147],
		craneRotationDeg: -144.7,
		camera: {
			position: [7.143, 3.2972, 1.8144],
			quaternion: [-0.062036, 0.208425, 0.013238, 0.975979],
			fov: 49,
		},
	},
];

export const MMK1_CAMERA_HOTSPOT_MOTION = {
	duration: 1.35,
	markerSize: 72,
};
