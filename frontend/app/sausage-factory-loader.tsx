type SausageFactoryLoaderProps = {
  compact?: boolean;
};

export default function SausageFactoryLoader({ compact = false }: SausageFactoryLoaderProps) {
  return <div className={`sausage-factory ${compact ? "compact" : ""}`} role="img" aria-label="Các cây xúc xích chạy trên dây chuyền và được đóng gói thành PDF">
    <svg viewBox="0 0 360 118" aria-hidden="true">
      <defs>
        <linearGradient id="sausage-skin" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f47b62" />
          <stop offset="1" stopColor="#cf493f" />
        </linearGradient>
        <linearGradient id="machine-body" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#173c32" />
          <stop offset="1" stopColor="#0b7560" />
        </linearGradient>
        <clipPath id="sausage-input-lane"><rect x="5" y="30" width="158" height="55" rx="10" /></clipPath>
      </defs>

      <g className="factory-belt">
        <rect x="8" y="77" width="344" height="23" rx="11.5" fill="#17352d" />
        <path d="M20 86h320" stroke="#74cbb0" strokeWidth="2" strokeDasharray="11 9" />
        {[28, 74, 120, 166, 212, 258, 304, 336].map((x) => <circle key={x} cx={x} cy="100" r="7" fill="#dbe8e3" stroke="#79968d" strokeWidth="2" />)}
      </g>

      <g clipPath="url(#sausage-input-lane)">
        {[0, 1, 2].map((index) => <g key={index} className="sausage-stick" style={{ animationDelay: `${index * -1.15}s` }}>
          <path d="M11 53l7-5v18l-7-5-5 3 2-7-2-7z" fill="#a73535" />
          <rect x="18" y="45" width="72" height="24" rx="12" fill="url(#sausage-skin)" stroke="#ad3836" strokeWidth="1.5" />
          <path d="M31 50c13-5 34-5 47 0" fill="none" stroke="#ffb09a" strokeWidth="3" strokeLinecap="round" opacity=".72" />
          <path d="M90 48l8 5 5-3-2 7 2 7-5-3-8 5z" fill="#a73535" />
        </g>)}
      </g>

      <g className="packing-machine">
        <rect x="151" y="25" width="76" height="63" rx="12" fill="url(#machine-body)" />
        <rect x="164" y="38" width="49" height="30" rx="7" fill="#effaf6" opacity=".96" />
        <path d="M176 45h25M176 52h18M176 59h22" stroke="#21a880" strokeWidth="3" strokeLinecap="round" />
        <rect x="169" y="88" width="9" height="11" rx="2" fill="#102a23" />
        <rect x="202" y="88" width="9" height="11" rx="2" fill="#102a23" />
        <circle cx="217" cy="32" r="4" fill="#ffcc5c" className="factory-light" />
      </g>

      <path d="M232 58h27" stroke="#5fc6a5" strokeWidth="4" strokeLinecap="round" strokeDasharray="6 7" className="package-route" />
      <g className="pdf-package">
        <rect x="270" y="30" width="67" height="55" rx="9" fill="#fff" stroke="#d7e4df" strokeWidth="2" />
        <path d="M318 30v14h19" fill="#edf5f2" stroke="#d7e4df" strokeWidth="2" strokeLinejoin="round" />
        <rect x="280" y="47" width="38" height="20" rx="6" fill="#e8534d" />
        <text x="299" y="61" fill="#fff" fontSize="10" fontWeight="900" textAnchor="middle">PDF</text>
        <path d="M282 75h42" stroke="#bdd0c9" strokeWidth="3" strokeLinecap="round" />
      </g>
    </svg>
    <span className="factory-caption">Dây chuyền đang đóng gói tài liệu</span>
  </div>;
}
