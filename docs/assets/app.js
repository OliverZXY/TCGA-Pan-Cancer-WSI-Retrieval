const csvPath = "data/TCGA_Pan_Cancer_all_center_task.csv";
const colors = ["#e95f46", "#d89b26", "#2aa876", "#187f88", "#6f56c8", "#c84f8c", "#4876d6"];

const state = {
  rows: [],
  centers: [],
  counts: {},
  stats: {},
  selectedCenter: null,
  chartMode: "primary_site",
  filter: "",
};

const format = new Intl.NumberFormat("en-US");

function displayLabel(value) {
  return String(value == null ? "" : value).replace(/_/g, " ");
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"' && quoted && next === '"') {
      field += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(field);
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }

  const headers = rows[0];
  const data = rows.slice(1);
  return data.map((values) => {
    const entry = {};
    headers.forEach((header, index) => {
      entry[header] = values[index] || "";
    });
    return entry;
  });
}

function countBy(rows, key) {
  const counts = new Map();
  rows.forEach((row) => counts.set(row[key], (counts.get(row[key]) || 0) + 1));
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

function uniqueCount(rows, key) {
  return new Set(rows.map((row) => row[key])).size;
}

function summarizeCenters(rows) {
  return countBy(rows, "data_center")
    .map(({ name, count }) => {
      const group = rows.filter((row) => row.data_center === name);
      const task = group[0] ? group[0].task_id : "";
      return {
        name,
        task,
        slides: count,
        cases: uniqueCount(group, "case_id"),
        projects: uniqueCount(group, "project_id"),
        primarySites: uniqueCount(group, "primary_site"),
        sourceSites: uniqueCount(group, "clean_tissue_source_site_name"),
        nations: uniqueCount(group, "tissue_source_site_nation"),
        nationCounts: countBy(group, "tissue_source_site_nation"),
      };
    })
    .sort((a, b) => Number(a.task) - Number(b.task));
}

function setText(selector, value) {
  const element = document.querySelector(selector);
  if (element) element.textContent = value;
}

function renderStats() {
  setText('[data-stat="slides"]', format.format(state.stats.slides || state.rows.length));
  setText('[data-stat="cases"]', format.format(state.stats.cases || uniqueCount(state.rows, "case_id")));
  setText('[data-stat="projects"]', format.format(state.stats.projects || uniqueCount(state.rows, "project_id")));
  setText('[data-stat="centers"]', format.format(state.stats.centers || uniqueCount(state.rows, "data_center")));
}

function renderCenterList() {
  const element = document.querySelector("#center-list");
  element.innerHTML = state.centers
    .map(
      (center) => `
        <button class="center-button ${center.name === state.selectedCenter ? "active" : ""}" data-center="${center.name}">
          <span>
            <strong>${displayLabel(center.name)}</strong><br />
            task ${center.task} - ${center.projects} projects - ${center.nations} nation${center.nations > 1 ? "s" : ""}
          </span>
          <strong>${format.format(center.slides)}</strong>
        </button>
      `,
    )
    .join("");

  element.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedCenter = button.dataset.center;
      renderCenterList();
      renderSelectedCenter();
    });
  });
}

function renderSelectedCenter() {
  const center = state.centers.find((item) => item.name === state.selectedCenter) || state.centers[0];
  if (!center) return;

  setText("#selected-task", `task ${center.task}`);
  setText("#selected-nations", `${center.nations} nation${center.nations > 1 ? "s" : ""}`);
  setText("#selected-center", displayLabel(center.name));
  setText("#center-slides", format.format(center.slides));
  setText("#center-cases", format.format(center.cases));
  setText("#center-projects", format.format(center.projects));
  setText("#center-sites", format.format(center.sourceSites));

  const max = Math.max(...center.nationCounts.map((item) => item.count));
  document.querySelector("#center-nation-bars").innerHTML = center.nationCounts
    .map(
      (item, index) => `
        <div class="mini-bar">
          <label>${displayLabel(item.name)}</label>
          <div class="track">
            <div class="fill" style="--w:${(item.count / max) * 100}%;--bar-color:${colors[index % colors.length]}"></div>
          </div>
          <strong>${format.format(item.count)}</strong>
        </div>
      `,
    )
    .join("");
}

function renderTaxonomyChart() {
  const chart = document.querySelector("#taxonomy-chart");
  const sourceItems = state.rows.length ? countBy(state.rows, state.chartMode) : state.counts[state.chartMode] || [];
  const items = sourceItems.filter((item) =>
    (item.name + " " + displayLabel(item.name)).toLowerCase().includes(state.filter.toLowerCase()),
  );
  const max = Math.max(...items.map((item) => item.count), 1);

  chart.innerHTML = items
    .map(
      (item, index) => `
        <div class="chart-row">
          <label title="${displayLabel(item.name)}">${displayLabel(item.name)}</label>
          <div class="track">
            <div class="fill" style="--w:${(item.count / max) * 100}%;--bar-color:${colors[index % colors.length]}"></div>
          </div>
          <strong>${format.format(item.count)}</strong>
        </div>
      `,
    )
    .join("");
}

function bindControls() {
  document.querySelectorAll(".segmented button").forEach((button) => {
    button.addEventListener("click", () => {
      state.chartMode = button.dataset.mode;
      document.querySelectorAll(".segmented button").forEach((item) => {
        item.classList.toggle("active", item === button);
        item.setAttribute("aria-selected", item === button ? "true" : "false");
      });
      renderTaxonomyChart();
    });
  });

  document.querySelector("#chart-filter").addEventListener("input", (event) => {
    state.filter = event.target.value;
    renderTaxonomyChart();
  });
}

function startHeroCanvas() {
  const canvas = document.querySelector("#hero-canvas");
  const context = canvas.getContext("2d");
  const points = Array.from({ length: 90 }, (_, index) => ({
    x: Math.random(),
    y: Math.random(),
    r: 1.5 + Math.random() * 4.5,
    dx: (Math.random() - 0.5) * 0.00045,
    dy: (Math.random() - 0.5) * 0.00045,
    color: colors[index % colors.length],
  }));

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    canvas.width = window.innerWidth * ratio;
    canvas.height = window.innerHeight * ratio;
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  function draw() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    context.clearRect(0, 0, width, height);
    context.fillStyle = "#fffaf1";
    context.fillRect(0, 0, width, height);

    points.forEach((point, index) => {
      point.x += point.dx;
      point.y += point.dy;
      if (point.x < 0.02 || point.x > 0.98) point.dx *= -1;
      if (point.y < 0.02 || point.y > 0.98) point.dy *= -1;

      const x = point.x * width;
      const y = point.y * height;

      for (let j = index + 1; j < points.length; j += 1) {
        const other = points[j];
        const ox = other.x * width;
        const oy = other.y * height;
        const distance = Math.hypot(x - ox, y - oy);
        if (distance < 125) {
          context.strokeStyle = `rgba(24, 127, 136, ${0.14 * (1 - distance / 125)})`;
          context.lineWidth = 1;
          context.beginPath();
          context.moveTo(x, y);
          context.lineTo(ox, oy);
          context.stroke();
        }
      }

      context.fillStyle = point.color;
      context.globalAlpha = 0.72;
      context.beginPath();
      context.arc(x, y, point.r, 0, Math.PI * 2);
      context.fill();
      context.globalAlpha = 1;
    });

    requestAnimationFrame(draw);
  }

  resize();
  window.addEventListener("resize", resize);
  draw();
}

async function init() {
  startHeroCanvas();
  bindControls();

  try {
    const response = await fetch(csvPath);
    if (!response.ok) throw new Error(`Unable to load ${csvPath}`);
    state.rows = parseCsv(await response.text());
    state.centers = summarizeCenters(state.rows);
    state.stats = {
      slides: state.rows.length,
      cases: uniqueCount(state.rows, "case_id"),
      projects: uniqueCount(state.rows, "project_id"),
      centers: uniqueCount(state.rows, "data_center"),
    };
    state.selectedCenter = state.centers[0] ? state.centers[0].name : null;
    renderStats();
    renderCenterList();
    renderSelectedCenter();
    renderTaxonomyChart();
  } catch (error) {
    if (window.DATASET_SUMMARY) {
      state.stats = window.DATASET_SUMMARY.stats;
      state.centers = window.DATASET_SUMMARY.centers;
      state.counts = window.DATASET_SUMMARY.counts;
      state.selectedCenter = state.centers[0] ? state.centers[0].name : null;
      renderStats();
      renderCenterList();
      renderSelectedCenter();
      renderTaxonomyChart();
    } else {
      document.querySelector("#taxonomy-chart").innerHTML = `
        <p class="load-error">
          The CSV manifest could not be loaded. Serve the docs folder through a local
          web server or publish it with GitHub Pages.
        </p>
      `;
    }
    console.error(error);
  }
}

init();
