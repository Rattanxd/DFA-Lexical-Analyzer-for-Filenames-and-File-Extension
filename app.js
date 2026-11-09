"use strict";

const VALID_EXTENSIONS = new Set(["pdf", "txt", "png", "jpg"]);
const filesByName = new Map();
let activeFilter = "all";

const input = document.querySelector("#file-input");
const dropzone = document.querySelector("#dropzone");
const resultsBody = document.querySelector("#results-body");
const emptyState = document.querySelector("#empty-state");
const clearButton = document.querySelector("#clear-button");

// Scan manually, like a DFA: consume the filename body in q0, cross the dot
// into q1, then accept only when q1 has consumed one exact supported extension.
// Scan using a strict DFA: consume the body in q0, cross the dot into q1, 
// and transition to a trap state (q3) if rules are violated.
function analyzeFilename(filename) {
  let state = "q0";
  let body = "";
  let extension = "";
  const invalidCharacters = [];
  const reasons = [];

  for (const character of filename) {
    switch (state) {
      case "q0": // Reading filename body
        if (character === ".") {
          state = "q1";
        } else {
          const isBodyCharacter =
            (character >= "a" && character <= "z") ||
            (character >= "A" && character <= "Z") ||
            (character >= "0" && character <= "9") ||
            character === "_";
            
          if (isBodyCharacter) {
            body += character;
          } else {
            invalidCharacters.push(character);
            state = "q3"; // Transition to trap state
          }
        }
        break;

      case "q1": // Reading extension
        if (character === ".") {
          reasons.push("Multiple dots are not allowed");
          state = "q3"; // Transition to trap state
        } else {
          const isExtCharacter =
            (character >= "a" && character <= "z") ||
            (character >= "A" && character <= "Z");
            
          if (isExtCharacter) {
            extension += character;
          } else {
            invalidCharacters.push(character);
            state = "q3"; // Transition to trap state
          }
        }
        break;

      case "q3": // Trap (dead) state
        // The machine is rejected, but we continue consuming characters 
        // to gather all errors for a complete user-facing reason.
        if (character === "." && !reasons.includes("Multiple dots are not allowed")) {
          reasons.push("Multiple dots are not allowed");
        } else if (character !== ".") {
          const isValidAnywhere =
            (character >= "a" && character <= "z") ||
            (character >= "A" && character <= "Z") ||
            (character >= "0" && character <= "9") ||
            character === "_";
          if (!isValidAnywhere) invalidCharacters.push(character);
        }
        break;
    }
  }

  // Acceptance check: Ends in q1 with a valid body and supported extension
  if (state === "q1" && body.length > 0 && VALID_EXTENSIONS.has(extension)) {
    state = "q2";
  }

  // Compile final rejection reasons
  if (state === "q0") reasons.push("Missing extension boundary (.)");
  if (body.length === 0 && (state === "q1" || state === "q3")) {
    if (!reasons.includes("Filename body is empty")) reasons.push("Filename body is empty");
  }
  if (invalidCharacters.length) {
    const uniqueCharacters = [...new Set(invalidCharacters)];
    reasons.push(`Unsupported character(s): ${uniqueCharacters.map((char) => JSON.stringify(char)).join(", ")}`);
  }
  if (state === "q1" && !VALID_EXTENSIONS.has(extension)) {
    reasons.push(`Unsupported extension: .${extension}`);
  }

  if (reasons.length || state !== "q2") {
    return { 
      accepted: false, 
      tokens: "", 
      reason: reasons.join(", ") || "Rejected by DFA" 
    };
  }

  return {
    accepted: true,
    tokens: `<FILENAME_BODY: ${body}> <DOT> <VALID_EXTENSION: ${extension}>`,
    reason: "",
  };
}

function addFiles(fileList) {
  for (const file of fileList) {
    if (!filesByName.has(file.name)) filesByName.set(file.name, file);
  }
  render();
}

function makeCell(text, className) {
  const cell = document.createElement("td");
  if (className) cell.className = className;
  cell.textContent = text;
  return cell;
}

function render() {
  const records = [...filesByName.values()].map((file) => ({ file, ...analyzeFilename(file.name) }));
  const accepted = records.filter((record) => record.accepted).length;
  const rejected = records.length - accepted;
  document.querySelector("#total-count").textContent = records.length;
  document.querySelector("#accepted-count").textContent = accepted;
  document.querySelector("#rejected-count").textContent = rejected;
  document.querySelector("#all-filter-count").textContent = records.length;
  document.querySelector("#accepted-filter-count").textContent = accepted;
  document.querySelector("#rejected-filter-count").textContent = rejected;
  clearButton.disabled = records.length === 0;

  const visible = records.filter((record) => activeFilter === "all" || (activeFilter === "accepted") === record.accepted);
  resultsBody.replaceChildren();
  for (const record of visible) {
    const row = document.createElement("tr");
    row.append(makeCell(record.file.name));
    const badgeCell = document.createElement("td");
    const badge = document.createElement("span");
    badge.className = `badge ${record.accepted ? "accepted" : "rejected"}`;
    badge.textContent = record.accepted ? "ACCEPTED" : "REJECTED";
    badgeCell.append(badge);
    row.append(badgeCell);
    row.append(makeCell(record.accepted ? record.tokens : record.reason, record.accepted ? "token" : "reason"));
    resultsBody.append(row);
  }
  emptyState.hidden = visible.length > 0;
  if (records.length === 0) {
    emptyState.querySelector("b").textContent = "Nothing to analyze yet";
    emptyState.querySelector("p").textContent = "Choose files or drop them above to see the DFA results.";
  } else if (visible.length === 0) {
    emptyState.querySelector("b").textContent = "No files in this category";
    emptyState.querySelector("p").textContent = "Choose another filter to view your analysis results.";
  }
}

input.addEventListener("change", (event) => {
  addFiles(event.target.files);
  input.value = "";
});
clearButton.addEventListener("click", () => {
  filesByName.clear();
  activeFilter = "all";
  document.querySelectorAll(".filter-button").forEach((button) => button.classList.toggle("active", button.dataset.filter === "all"));
  render();
});
document.querySelectorAll(".filter-button").forEach((button) => {
  button.addEventListener("click", () => {
    activeFilter = button.dataset.filter;
    document.querySelectorAll(".filter-button").forEach((item) => item.classList.toggle("active", item === button));
    render();
  });
});

for (const eventName of ["dragenter", "dragover"]) {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.add("dragging");
  });
}
for (const eventName of ["dragleave", "drop"]) {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.remove("dragging");
  });
}
dropzone.addEventListener("drop", (event) => addFiles(event.dataTransfer.files));

render();
