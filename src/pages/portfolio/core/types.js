/**
 * @file JSDoc-контракты Portfolio Exploration Engine.
 * UI и scene работают только с этими типами.
 *
 * Главный принцип: поведение 3D-модели/сцены задаётся в конфиге (state.scene, hotspot.investigation.behavior).
 * Камера — опциональный вспомогательный инструмент, не суть interaction.
 */

/**
 * @typedef {'eager' | 'lazy' | 'onDemand'} MediaLoadPolicy
 */

/**
 * @typedef {Object} PortfolioMedia
 * @property {'image' | 'video'} type
 * @property {string} src
 * @property {string} [poster] Превью для onDemand-видео
 * @property {string} [alt]
 * @property {MediaLoadPolicy} [load] Для video: по умолчанию onDemand
 * @property {string} [playLabel] Подпись кнопки «Смотреть видео»
 */

/**
 * @typedef {Object} PortfolioTrait
 * @property {string} label
 * @property {string} [value]
 * @property {string[]} [values]
 */

/**
 * @typedef {Object} PortfolioFeature
 * @property {string} title
 * @property {string} [subtitle]
 */

/**
 * @typedef {Object} PortfolioCameraSettings
 * @property {[number, number, number]} [position]
 * @property {[number, number, number]} [lookAt]
 * @property {number} [fov]
 * @property {number} [zoom]
 */

/**
 * Поведение 3D-модели и сцены — основной конфиг state / investigation.
 * Интерпретация — в scene.js конкретного проекта.
 *
 * @typedef {Object} SceneBehavior
 * @property {Record<string, unknown>} [model] Видимость, анимации, материалы mesh/nodes
 * @property {Record<string, unknown>} [lights]
 * @property {Record<string, unknown>} [postProcess] bloom, grain, blur…
 * @property {Record<string, unknown>} [background] liquid, fog, env…
 * @property {string[]} [playAnimations] Имена анимаций для запуска при входе в state
 * @property {string[]} [stopAnimations]
 * @property {PortfolioCameraSettings} [camera] Опционально — не главный фокус
 * @property {Record<string, SceneBehavior>} [subStages] Внутренние этапы внутри state (stage_01…)
 */

/**
 * @typedef {Object} PortfolioSubStage
 * @property {string} id
 * @property {string} [title]
 * @property {SceneBehavior} behavior
 * @property {number} [scrollAnchor] 0…1 внутри родительского state
 */

/**
 * @typedef {'ready' | 'needsContent' | 'needsBehavior' | 'needsDesign'} ProjectContentStatus
 */

/**
 * @typedef {Object} PortfolioState
 * @property {string} id
 * @property {string} title
 * @property {string} [subtitle]
 * @property {string} [description]
 * @property {PortfolioTrait[]} [traits]
 * @property {PortfolioMedia} [media]
 * @property {PortfolioCameraSettings} [camera] @deprecated Prefer scene.camera inside SceneBehavior
 * @property {SceneBehavior} [scene] Поведение 3D при этом state
 * @property {PortfolioSubStage[]} [subStages] Внутренние этапы (разное поведение модели внутри главы)
 * @property {string} [pathTitle] Короткий заголовок для правого пути
 * @property {string} [pathSubtitle] Подпись под пунктом пути
 * @property {string[]} [descriptionParagraphs] Абзацы описания (desktop)
 * @property {PortfolioFeature[]} [features] Нумерованный список особенностей
 * @property {number} [scrollAnchor] 0…1
 * @property {ProjectContentStatus} [status]
 * @property {Partial<Record<'en' | 'zh', Partial<PortfolioState>>>} [localizedCopy]
 */

/**
 * @typedef {Object} PortfolioCaseStudyUiConfig
 * @property {boolean} [renderTextInScene] WebGL left panel (CaseStudyPanelHud) instead of HTML canvas
 * @property {number} [chapterBase] База нумерации глав (1 → 01, 02…)
 * @property {boolean} [useSectionBadge] Бейдж «01 / О ПРОЕКТЕ» вместо STATE
 * @property {boolean} [hideCategoryLabel] Скрыть categoryLabel над заголовком
 * @property {boolean} [hideTags] Не показывать pill-теги (если те же данные в metrics)
 * @property {boolean} [statsValueFirst] Метрики: значение сверху, подпись снизу
 * @property {'rail' | 'verticalList'} [metricsLayout] rail — 3 колонки; verticalList — список как в макете
 * @property {boolean} [anchorFooterBlock] Stats/features + footer прижать к низу зоны
 * @property {string} [footerLabel] Подпись внизу левой панели
 * @property {Partial<Record<'en' | 'zh', string>>} [footerLabelCopy] Локализованные подписи footer
 * @property {boolean} [mobileHorizontalSwipe] Горизонтальные сцены на мобилке
 * @property {{ min?: number, max?: number, ratio?: number }} [panelWidth] Ширина левой панели на desktop
 * @property {number} [contentTopPx] Y от верха viewport для начала панели (вместо home-icon)
 * @property {number} [contentBottomInsetPx] Отступ нижней границы панели от низа viewport
 */

/**
 * Investigation = отдельный режим с уникальным поведением модели (не tooltip, не «просто камера»).
 *
 * @typedef {Object} InvestigationBehavior
 * @property {SceneBehavior} behavior Главное: что делает модель/сцена
 * @property {boolean} [hideOtherHotspots]
 * @property {string} [uiTitle] Подпись в левой панели (опционально)
 * @property {string} [uiDescription] Пояснение в UI (опционально; не заменяет 3D-поведение)
 */

/**
 * @typedef {'ready' | 'needsPosition' | 'needsBehavior' | 'needsDesign'} HotspotStatus
 */

/**
 * @typedef {Object} PortfolioHotspot
 * @property {string} id
 * @property {[number, number, number] | null} position
 * @property {string} title
 * @property {string} [description] Краткая подпись для UI; суть — investigation.behavior
 * @property {InvestigationBehavior} investigation
 * @property {HotspotStatus} [status]
 * @property {string[]} [meshAnchors]
 */

/**
 * @typedef {Record<string, PortfolioHotspot[]>} HotspotsByState
 */

/**
 * @typedef {Object} PortfolioVideoPolicy
 * @property {number} maxVideos Максимум видео на проект (обычно 1)
 * @property {MediaLoadPolicy} defaultLoad onDemand — грузить только по клику пользователя
 */

/**
 * @typedef {Object} PortfolioOptionalVideo
 * @property {string} src
 * @property {string} [poster]
 * @property {string} [label]
 * @property {string} attachToState id state, где показывается кнопка
 */

/**
 * @typedef {Object} PortfolioSceneLayout
 * @property {PortfolioCameraSettings} defaultCamera
 * @property {[number, number, number]} [rootOffsetDesktop]
 * @property {[number, number, number]} [rootOffsetMobile]
 * @property {number} [scale]
 */

/**
 * @typedef {Object} PortfolioLifecycle
 * @property {number} [enterMs]
 * @property {number} [exitMs]
 * @property {{ enterFromHub?: string | null, leaveToHub?: string | null, leaveToOther?: string | null }} [routeSounds]
 * @property {string | null} [stateChangeSound]
 * @property {string | null} [investigationEnterSound]
 */

/**
 * @typedef {Object} PortfolioProjectConfig
 * @property {string} id
 * @property {string} slug
 * @property {string} route
 * @property {string} title
 * @property {string} [summary]
 * @property {{ primary: string, [key: string]: string }} [models]
 * @property {PortfolioSceneLayout} [scene]
 * @property {{ year?: number | string, type?: string, skills?: string[], accentColor?: string }} [meta]
 * @property {string} [hubLogo]
 * @property {PortfolioVideoPolicy} [mediaPolicy]
 * @property {PortfolioOptionalVideo} [optionalVideo]
 * @property {ProjectContentStatus} [contentStatus]
 * @property {PortfolioLifecycle} [lifecycle]
 * @property {PortfolioCaseStudyUiConfig} [caseStudy]
 */

/**
 * @typedef {Object} PlannedInteractive
 * @property {string} id
 * @property {string} title
 * @property {string} description
 * @property {string[]} [relatedStates]
 * @property {string[]} [relatedHotspots]
 * @property {'needsDesign' | 'needsImplementation'} status
 */

/**
 * @typedef {Object} ProjectSceneContext
 * @property {import('three').Scene} threeScene
 * @property {import('three').Camera} camera
 * @property {PortfolioProjectConfig} config
 * @property {(id: string) => PortfolioState | undefined} getStateById
 * @property {(behavior: SceneBehavior) => void} applyBehavior
 */

/**
 * @typedef {Object} ProjectSceneRuntime
 * @property {number} scrollProgress
 * @property {number} stageProgress
 * @property {number} stageProgressTarget
 * @property {string} activeStateId
 * @property {string | null} activeSubStageId
 * @property {string | null} investigationHotspotId
 */

/**
 * @typedef {Object} ProjectSceneController
 * @property {() => void} mount
 * @property {() => void} unmount
 * @property {(nextId: string, prevId: string | null, state: PortfolioState) => void} onStateChange
 * @property {(subStageId: string, state: PortfolioState) => void} [onSubStageChange]
 * @property {(hotspot: PortfolioHotspot) => void} onInvestigationEnter
 * @property {() => void} onInvestigationLeave
 * @property {(delta: number, runtime: ProjectSceneRuntime) => void} update
 */

/**
 * @typedef {Object} PortfolioProjectModule
 * @property {PortfolioProjectConfig} config
 * @property {PortfolioState[]} states
 * @property {HotspotsByState} hotspots
 * @property {PlannedInteractive[]} [plannedInteractives]
 * @property {Record<string, { shortDescription: string, shortFeatures?: PortfolioFeature[], detailsTitle?: string }>} [mobileContent]
 * @property {(context: ProjectSceneContext) => ProjectSceneController} createScene
 */

export {};
