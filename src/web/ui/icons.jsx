/**
 * The desktop's icon set: one family, drawn on a 24px grid with a 2px round
 * stroke, shown at 16px beside 13-14px text (and 18px in the top bar).
 *
 * The phone's icons are a mix of sizes and weights chosen screen by screen;
 * a desktop sidebar, table and toolbar show dozens side by side, where that
 * mix reads as noise. Everything here takes `size` and inherits currentColor.
 *
 * @typedef {{size?: number, className?: string}} IconProps
 */

/** @param {IconProps & {children: import('react').ReactNode}} props */
function Svg({ size = 16, className = '', children }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={`shrink-0 ${className}`}
    >
      {children}
    </svg>
  )
}

/** @param {IconProps} p */ export const ISearch = (p) => <Svg {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></Svg>
/** @param {IconProps} p */ export const IHome = (p) => <Svg {...p}><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5" /></Svg>
/** @param {IconProps} p */ export const IList = (p) => <Svg {...p}><path d="M8 6h13M8 12h13M8 18h13" /><path d="M3.5 6h.01M3.5 12h.01M3.5 18h.01" /></Svg>
/** @param {IconProps} p */ export const IWallet = (p) => <Svg {...p}><path d="M19 7V5a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2" /><path d="M3 6v13a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-3" /></Svg>
/** @param {IconProps} p */ export const IChart = (p) => <Svg {...p}><path d="M3 3v18h18" /><path d="M7 15l4-4 3 3 5-6" /></Svg>
/** @param {IconProps} p */ export const IPie = (p) => <Svg {...p}><path d="M21 12a9 9 0 1 1-9-9v9z" /><path d="M15 3.5A9 9 0 0 1 20.5 9H15z" /></Svg>
/** @param {IconProps} p */ export const ITarget = (p) => <Svg {...p}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></Svg>
/** @param {IconProps} p */ export const IRepeat = (p) => <Svg {...p}><path d="m17 2 4 4-4 4" /><path d="M3 11v-1a4 4 0 0 1 4-4h14" /><path d="m7 22-4-4 4-4" /><path d="M21 13v1a4 4 0 0 1-4 4H3" /></Svg>
/** @param {IconProps} p */ export const IUsers = (p) => <Svg {...p}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></Svg>
/** @param {IconProps} p */ export const INote = (p) => <Svg {...p}><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6M8 13h8M8 17h5" /></Svg>
/** @param {IconProps} p */ export const ITrophy = (p) => <Svg {...p}><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z" /><path d="M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3" /></Svg>
/** @param {IconProps} p */ export const IImport = (p) => <Svg {...p}><path d="M12 3v12M7 10l5 5 5-5" /><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /></Svg>
/** @param {IconProps} p */ export const IDownload = IImport
/** @param {IconProps} p */ export const ISettings = (p) => <Svg {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></Svg>
/** @param {IconProps} p */ export const IPlus = (p) => <Svg {...p}><path d="M12 5v14M5 12h14" /></Svg>
/** @param {IconProps} p */ export const IBell = (p) => <Svg {...p}><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></Svg>
/** @param {IconProps} p */ export const IChevronDown = (p) => <Svg {...p}><path d="m6 9 6 6 6-6" /></Svg>
/** @param {IconProps} p */ export const IChevronUp = (p) => <Svg {...p}><path d="m18 15-6-6-6 6" /></Svg>
/** @param {IconProps} p */ export const IChevronRight = (p) => <Svg {...p}><path d="m9 18 6-6-6-6" /></Svg>
/** @param {IconProps} p */ export const IChevronLeft = (p) => <Svg {...p}><path d="m15 18-6-6 6-6" /></Svg>
/** @param {IconProps} p */ export const IX = (p) => <Svg {...p}><path d="M18 6 6 18M6 6l12 12" /></Svg>
/** @param {IconProps} p */ export const IFilter = (p) => <Svg {...p}><path d="M3 5h18l-7 8.5V19l-4 2v-7.5z" /></Svg>
/** @param {IconProps} p */ export const ICalendar = (p) => <Svg {...p}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></Svg>
/** @param {IconProps} p */ export const IMore = (p) => <Svg {...p}><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></Svg>
/** @param {IconProps} p */ export const ICheck = (p) => <Svg {...p}><path d="M20 6 9 17l-5-5" /></Svg>
/** @param {IconProps} p */ export const IArrowUp = (p) => <Svg {...p}><path d="M12 19V5M5 12l7-7 7 7" /></Svg>
/** @param {IconProps} p */ export const IArrowDown = (p) => <Svg {...p}><path d="M12 5v14M19 12l-7 7-7-7" /></Svg>
/** @param {IconProps} p */ export const IArrowUpRight = (p) => <Svg {...p}><path d="M7 17 17 7M7 7h10v10" /></Svg>
/** @param {IconProps} p */ export const IArrowDownLeft = (p) => <Svg {...p}><path d="M17 7 7 17M17 17H7V7" /></Svg>
/** @param {IconProps} p */ export const ITransfer = (p) => <Svg {...p}><path d="M7 4 3 8l4 4" /><path d="M3 8h14" /><path d="m17 20 4-4-4-4" /><path d="M21 16H7" /></Svg>
/** @param {IconProps} p */ export const ISun = (p) => <Svg {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" /></Svg>
/** @param {IconProps} p */ export const IMoon = (p) => <Svg {...p}><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></Svg>
/** @param {IconProps} p */ export const IPhone = (p) => <Svg {...p}><rect x="6" y="2" width="12" height="20" rx="2" /><path d="M11 18h2" /></Svg>
/** @param {IconProps} p */ export const IRefresh = (p) => <Svg {...p}><path d="M21 12a9 9 0 0 1-15.5 6.2L3 16" /><path d="M3 21v-5h5" /><path d="M3 12a9 9 0 0 1 15.5-6.2L21 8" /><path d="M21 3v5h-5" /></Svg>
/** @param {IconProps} p */ export const ITrash = (p) => <Svg {...p}><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6M14 11v6" /></Svg>
/** @param {IconProps} p */ export const IEdit = (p) => <Svg {...p}><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" /></Svg>
/** @param {IconProps} p */ export const ITag = (p) => <Svg {...p}><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z" /><path d="M7.5 7.5h.01" /></Svg>
/** @param {IconProps} p */ export const IEye = (p) => <Svg {...p}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></Svg>
/** @param {IconProps} p */ export const IEyeOff = (p) => <Svg {...p}><path d="M9.9 4.24A9.1 9.1 0 0 1 12 4c6.5 0 10 7 10 7a18.5 18.5 0 0 1-2.16 3.19M6.6 6.6A18.4 18.4 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6" /><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24M2 2l20 20" /></Svg>
/** @param {IconProps} p */ export const ISidebar = (p) => <Svg {...p}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /></Svg>
/** @param {IconProps} p */ export const ICommand = (p) => <Svg {...p}><path d="M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3" /></Svg>
/** @param {IconProps} p */ export const IUser = (p) => <Svg {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" /></Svg>
/** @param {IconProps} p */ export const IExternal = (p) => <Svg {...p}><path d="M15 3h6v6M10 14 21 3" /><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></Svg>
/** @param {IconProps} p */ export const IZap = (p) => <Svg {...p}><path d="M13 2 4 14h7l-1 8 9-12h-7z" /></Svg>
/** @param {IconProps} p */ export const ICircleDot = (p) => <Svg {...p}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="2" /></Svg>
/** @param {IconProps} p */ export const IGrid = (p) => <Svg {...p}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></Svg>
/** @param {IconProps} p */ export const IBank = (p) => <Svg {...p}><path d="M3 21h18M4 10h16M5 10v8M9.5 10v8M14.5 10v8M19 10v8M12 3l9 5H3z" /></Svg>
/** @param {IconProps} p */ export const ICard = (p) => <Svg {...p}><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20M6 15h4" /></Svg>
/** @param {IconProps} p */ export const ICamera = (p) => <Svg {...p}><path d="M14.5 4h-5L8 6H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-3z" /><circle cx="12" cy="13" r="3.5" /></Svg>
/** @param {IconProps} p */ export const ISliders = (p) => <Svg {...p}><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" /></Svg>
/** @param {IconProps} p */ export const IGauge = (p) => <Svg {...p}><path d="M12 14l4-4" /><path d="M3.34 19a10 10 0 1 1 17.32 0" /></Svg>
/** @param {IconProps} p */ export const IClock = (p) => <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Svg>
/** @param {IconProps} p */ export const IAlert = (p) => <Svg {...p}><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4M12 17h.01" /></Svg>
/** @param {IconProps} p */ export const ILogOut = (p) => <Svg {...p}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></Svg>
/** @param {IconProps} p */ export const ICornerDownLeft = (p) => <Svg {...p}><path d="M9 10 4 15l5 5" /><path d="M20 4v7a4 4 0 0 1-4 4H4" /></Svg>
/** @param {IconProps} p */ export const ISparkle = (p) => <Svg {...p}><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" /><path d="M19 17v4M17 19h4" /></Svg>
/** @param {IconProps} p */ export const IUndo = (p) => <Svg {...p}><path d="M3 7v6h6" /><path d="M21 17a9 9 0 0 0-15-6.7L3 13" /></Svg>
/** @param {IconProps} p */ export const ILock = (p) => <Svg {...p}><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></Svg>
/** @param {IconProps} p */ export const IShield = (p) => <Svg {...p}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></Svg>
/** @param {IconProps} p */ export const IGlobe = (p) => <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></Svg>
/** @param {IconProps} p */ export const IPalette = (p) => <Svg {...p}><path d="M12 3a9 9 0 0 0 0 18c1.1 0 1.8-.9 1.8-1.8 0-.5-.2-.9-.5-1.2-.3-.3-.5-.8-.5-1.2 0-1 .8-1.8 1.8-1.8H17a4 4 0 0 0 4-4c0-4.4-4-8-9-8z" /><circle cx="7.5" cy="11.5" r="1" /><circle cx="10.5" cy="7.5" r="1" /><circle cx="15" cy="8" r="1" /></Svg>
/** @param {IconProps} p */ export const IMessage = (p) => <Svg {...p}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></Svg>
/** @param {IconProps} p */ export const IInfo = (p) => <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 16v-4M12 8h.01" /></Svg>
/** @param {IconProps} p */ export const IFileText = (p) => <Svg {...p}><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6M8 13h8M8 17h8" /></Svg>
/** @param {IconProps} p */ export const ICopy = (p) => <Svg {...p}><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" /></Svg>
/** @param {IconProps} p */ export const IMonitor = (p) => <Svg {...p}><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" /></Svg>
/** @param {IconProps} p */ export const IUpload = (p) => <Svg {...p}><path d="M12 15V3M7 8l5-5 5 5" /><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /></Svg>
