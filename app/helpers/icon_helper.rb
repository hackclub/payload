module IconHelper
  ICONS = {
    "activity" => "M22 12h-4l-3 9L9 3l-3 9H2",
    "arrow-right" => "M5 12h14M13 5l7 7-7 7",
    "check" => "M20 6 9 17l-5-5",
    "clock" => "M12 6v6l4 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
    "cpu" => "M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3M7 7h10v10H7z",
    "log-out" => "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9",
    "monitor" => "M20 16V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v10m16 0H4m16 0 1.5 3h-19L4 16",
    "play" => "m5 3 14 9-14 9V3Z",
    "shield" => "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z",
    "trash" => "M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14",
    "user" => "M20 21a8 8 0 1 0-16 0M12 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"
  }.freeze

  def icon(name, class_name: "icon")
    tag.svg(
      tag.path(d: ICONS.fetch(name, ICONS["monitor"])),
      class: class_name,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      stroke_width: "2",
      stroke_linecap: "round",
      stroke_linejoin: "round",
      aria: { hidden: "true" }
    )
  end
end
