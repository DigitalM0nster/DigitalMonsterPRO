const stateCopy = {
	state_01: {
		en: {
			pathTitle: "ABOUT THE PROJECT",
			title: "OFFICE RENTAL\nTHROUGH SPACE",
			descriptionParagraphs: [
				"As a subcontractor we developed an interactive office rental page for the Ostankino website. Users can move from a general view of the complex to a floor, a unit and its plan.",
				"DigitalMonster handled the frontend for this section, refinements to the WordPress admin and some of the complex animations on the homepage. The work took about two months.",
			],
			traits: [
				{ label: "year", value: "2025" },
				{ label: "timeline", value: "2 months" },
				{ label: "role", value: "frontend and WordPress" },
			],
		},
		zh: {
			pathTitle: "项目介绍",
			title: "通过空间\n完成办公租赁",
			descriptionParagraphs: [
				"作为分包方，我们为奥斯坦基诺网站开发了互动式办公租赁页面。用户可从综合体总览进入楼层、单元及其平面图。",
				"DigitalMonster负责该板块的前端、WordPress后台完善，以及首页部分复杂动画。工作周期约两个月。",
			],
			traits: [
				{ label: "年份", value: "2025" },
				{ label: "周期", value: "2个月" },
				{ label: "角色", value: "前端与WordPress" },
			],
		},
	},
	state_02: {
		en: {
			pathTitle: "VISUAL LANGUAGE",
			title: "ARCHITECTURE\nAS INTERFACE",
			descriptionParagraphs: [
				"A deep blue field turns the light building model into the main navigation object. White cards and a thin yellow accent separate data from the spatial diagram.",
				"Technical plans stay clean and readable, while large numeric parameters help users compare units quickly.",
			],
			features: [
				{ title: "Deep blue background", subtitle: "scene depth" },
				{ title: "Light model", subtitle: "navigation center" },
				{ title: "Plans and figures", subtitle: "precise information" },
			],
		},
		zh: {
			pathTitle: "视觉语言",
			title: "建筑即\n界面",
			descriptionParagraphs: [
				"深蓝场域使浅色建筑模型成为主要导航对象。白色卡片与细黄强调色将数据从空间图示中分离出来。",
				"技术平面图保持干净易读，大型数字参数帮助用户快速比较单元。",
			],
			features: [
				{ title: "深蓝背景", subtitle: "场景深度" },
				{ title: "浅色模型", subtitle: "导航中心" },
				{ title: "平面与数字", subtitle: "精确信息" },
			],
		},
	},
	state_03: {
		en: {
			pathTitle: "INTERACTIVE EXPERIENCE",
			title: "FROM THE BUILDING\nTO A SPECIFIC BLOCK",
			descriptionParagraphs: [
				"A pseudo-3D diagram lets users select floors directly on the complex model. The interface syncs the spatial image of the building with filters and an information card.",
				"After making a selection, users open a floor plan and see the parameters of a specific block without losing the context of its location.",
			],
			features: [
				{ title: "Floor selection", subtitle: "13 interface levels" },
				{ title: "Pseudo-3D model", subtitle: "spatial navigation" },
				{ title: "Block plan", subtitle: "detailed layout" },
			],
		},
		zh: {
			pathTitle: "互动体验",
			title: "从楼栋\n到具体单元",
			descriptionParagraphs: [
				"伪3D图示允许用户直接在综合体模型上选择楼层。界面将建筑的空间形象与筛选器和信息卡片同步。",
				"选择后，用户打开楼层平面图，查看具体单元参数，同时不丢失其所在位置的语境。",
			],
			features: [
				{ title: "楼层选择", subtitle: "13个界面层级" },
				{ title: "伪3D模型", subtitle: "空间导航" },
				{ title: "单元平面", subtitle: "详细布局" },
			],
		},
	},
	state_04: {
		en: {
			pathTitle: "UNIT CATALOG",
			title: "TWO WAYS\nTO FIND A SPACE",
			descriptionParagraphs: [
				"A unit can be found by parameters or directly on the building plan. An area range and floor selection narrow the catalog to matching options.",
				"Cards show area, floor, status and unit features, while a detailed screen reveals the block layout.",
			],
			features: [
				{ title: "Area filter", subtitle: "a value range" },
				{ title: "Floors", subtitle: "fast shortlisting" },
				{ title: "Cards and plans", subtitle: "unit details" },
			],
		},
		zh: {
			pathTitle: "单元目录",
			title: "两种方式\n找到空间",
			descriptionParagraphs: [
				"可通过参数或直接在建筑平面上查找单元。面积范围与楼层选择可将目录缩减为合适选项。",
				"卡片显示面积、楼层、状态与单元特点，详细页面则展开单元平面布局。",
			],
			features: [
				{ title: "面积筛选", subtitle: "数值区间" },
				{ title: "楼层", subtitle: "快速筛选" },
				{ title: "卡片与平面", subtitle: "单元详情" },
			],
		},
	},
	state_05: {
		en: {
			pathTitle: "PROJECT ENGINEERING",
			title: "INTERACTION CONTROLLED\nBY WORDPRESS",
			descriptionParagraphs: [
				"The frontend is connected to the WordPress admin so rental-page content can be updated without rebuilding the interface.",
				"The technical task brought a data catalog, filtering, unit plans and pseudo-3D navigation together into one working module.",
			],
			features: [
				{ title: "WordPress", subtitle: "content management" },
				{ title: "Frontend", subtitle: "state synchronization" },
				{ title: "Catalog", subtitle: "filters, cards and plans" },
			],
		},
		zh: {
			pathTitle: "项目工程",
			title: "由WordPress\n驱动的互动",
			descriptionParagraphs: [
				"前端与WordPress后台相连，使租赁页面内容可在不重新构建界面的情况下更新。",
				"技术任务将数据目录、筛选、单元平面图与伪3D导航整合进同一个可运行模块。",
			],
			features: [
				{ title: "WordPress", subtitle: "内容管理" },
				{ title: "Frontend", subtitle: "状态同步" },
				{ title: "目录", subtitle: "筛选、卡片与平面" },
			],
		},
	},
};

export default stateCopy;
