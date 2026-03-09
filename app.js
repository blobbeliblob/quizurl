(function () {
  "use strict";

  // --- Compression / Decompression helpers ---
  function compressQuiz(data) {
    const json = JSON.stringify(data);
    const compressed = pako.deflate(new TextEncoder().encode(json));
    return btoa(String.fromCharCode(...compressed))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  }

  function decompressQuiz(encoded) {
    const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    const decompressed = pako.inflate(bytes);
    return JSON.parse(new TextDecoder().decode(decompressed));
  }

  function shuffleArray(items) {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
  }

  function isNumericValue(value) {
    if (typeof value === "number") {
      return Number.isFinite(value);
    }
    if (typeof value !== "string") {
      return false;
    }

    const trimmed = value.trim();
    if (!trimmed) {
      return false;
    }

    return Number.isFinite(Number(trimmed));
  }

  // --- Routing ---
  function route() {
    const hash = window.location.hash.slice(1);
    if (hash) {
      showQuizView(hash);
    } else {
      showCreatorView();
    }
  }

  // =============================================
  //  QUIZ CREATOR
  // =============================================
  function showCreatorView() {
    document.getElementById("creator-view").classList.remove("hidden");
    document.getElementById("quiz-view").classList.add("hidden");
    initCreator();
  }

  let questionCount = 0;

  function initCreator() {
    document.getElementById("questions-container").innerHTML = "";
    questionCount = 0;
    addQuestion();

    document.getElementById("add-question-btn").onclick = addQuestion;
    document.getElementById("generate-link-btn").onclick = generateLink;
    document.getElementById("copy-link-btn").onclick = copyLink;
  }

  function addQuestion() {
    questionCount++;
    const idx = questionCount;
    const card = document.createElement("div");
    card.className = "question-card";
    card.dataset.idx = idx;
    card.innerHTML = `
      <h3>Question ${idx}</h3>
      <button class="remove-question-btn" title="Remove">&times;</button>
      <div class="form-group">
        <label>Question</label>
        <textarea class="q-text" placeholder="Enter your question"></textarea>
      </div>
      <div class="form-group">
        <label>Image URL (optional)</label>
        <input type="url" class="q-image" placeholder="https://...">
      </div>
      <div class="form-group">
        <label>Type</label>
        <select class="q-type">
          <option value="text">Text</option>
          <option value="numerical">Numerical</option>
          <option value="multiple_choice">Multiple Choice</option>
          <option value="multiple_response">Multiple Response</option>
        </select>
      </div>
      <div class="form-group answer-section">
        <label>Accepted Answer(s)</label>
        <input type="text" class="q-answer" placeholder="separate, multiple, answers, with, commas">
      </div>
      <div class="form-group randomize-options-section hidden">
        <label>
          <input type="checkbox" class="q-randomize-options">
          Randomize option order
        </label>
      </div>
      <div class="form-group options-section hidden">
        <label class="options-label">Options (select correct answers)</label>
        <div class="options-list"></div>
        <button class="add-option-btn">+ Add Option</button>
      </div>
    `;

    const container = document.getElementById("questions-container");
    container.appendChild(card);

    // Remove button
    card.querySelector(".remove-question-btn").onclick = () => {
      card.remove();
      renumberQuestions();
    };

    // Type toggle
    const typeSelect = card.querySelector(".q-type");
    typeSelect.onchange = () => toggleType(card, typeSelect.value);

    // Add option
    card.querySelector(".add-option-btn").onclick = () => addOption(card);

    // Seed two options for MC
    addOption(card);
    addOption(card);
  }

  function toggleType(card, type) {
    const answerSection = card.querySelector(".answer-section");
    const answerLabel = card.querySelector(".answer-section label");
    const answerInput = card.querySelector(".q-answer");
    const randomizeOptionsSection = card.querySelector(".randomize-options-section");
    const optionsSection = card.querySelector(".options-section");
    const optionsLabel = card.querySelector(".options-label");

    if (type === "text" || type === "numerical") {
      optionsSection.classList.add("hidden");
      randomizeOptionsSection.classList.add("hidden");
      answerSection.classList.remove("hidden");

      if (type === "numerical") {
        answerLabel.textContent = "Accepted Number(s)";
        answerInput.placeholder = "e.g. 3.14, -2, 42";
      } else {
        answerLabel.textContent = "Accepted Answer(s)";
        answerInput.placeholder = "separate, multiple, answers, with, commas";
      }
    } else {
      optionsSection.classList.remove("hidden");
      randomizeOptionsSection.classList.remove("hidden");
      answerSection.classList.add("hidden");
      syncOptionControlType(card, type);

      if (type === "multiple_choice") {
        optionsLabel.textContent = "Options (select one correct answer)";
        const checkedOptions = Array.from(
          card.querySelectorAll(".options-list .option-correct:checked")
        );
        checkedOptions.forEach((input, idx) => {
          input.checked = idx === 0;
        });
      } else {
        optionsLabel.textContent = "Options (select correct answers)";
      }
    }
  }

  function syncOptionControlType(card, type) {
    const optionCorrectInputs = card.querySelectorAll(".options-list .option-correct");
    optionCorrectInputs.forEach((input) => {
      if (type === "multiple_choice") {
        input.type = "radio";
        input.name = `correct-${card.dataset.idx}`;
      } else {
        input.type = "checkbox";
        input.removeAttribute("name");
      }
    });
  }

  function addOption(card) {
    const list = card.querySelector(".options-list");
    const row = document.createElement("div");
    row.className = "option-row";
    row.innerHTML = `
      <label class="option-correct-label" title="Mark as correct">
        <input type="checkbox" class="option-correct">
        <span>Correct</span>
      </label>
      <input type="text" class="option-text" placeholder="Option text">
      <button title="Remove">&times;</button>
    `;

    const optionCorrect = row.querySelector(".option-correct");
    optionCorrect.onchange = () => {
      const type = card.querySelector(".q-type").value;
      if (
        type !== "multiple_choice" ||
        !optionCorrect.checked ||
        optionCorrect.type === "radio"
      ) {
        return;
      }

      list.querySelectorAll(".option-correct").forEach((input) => {
        if (input !== optionCorrect) {
          input.checked = false;
        }
      });
    };

    row.querySelector("button").onclick = () => row.remove();
    list.appendChild(row);

    syncOptionControlType(card, card.querySelector(".q-type").value);
  }

  function renumberQuestions() {
    const cards = document.querySelectorAll(".question-card");
    cards.forEach((card, i) => {
      card.querySelector("h3").textContent = `Question ${i + 1}`;
    });
  }

  function buildQuizData() {
    const showAnswer = document.getElementById("show-answer-toggle").checked;
    const cards = document.querySelectorAll(".question-card");
    const questions = [];

    for (const card of cards) {
      const text = card.querySelector(".q-text").value.trim();
      if (!text) continue;

      const image = card.querySelector(".q-image").value.trim();
      const type = card.querySelector(".q-type").value;
      const q = { question: text, type, answer: [] };
      if (image) q.image = image;

      if (type === "multiple_response" || type === "multiple_choice") {
        const optionRows = card.querySelectorAll(".options-list .option-row");
        q.options = [];
        q.answer = [];
        q.randomize_options = card.querySelector(".q-randomize-options").checked;

        optionRows.forEach((row) => {
          const optionText = row.querySelector(".option-text").value.trim();
          if (!optionText) return;

          q.options.push(optionText);
          if (row.querySelector(".option-correct").checked) {
            q.answer.push(optionText);
          }
        });
      } else {
        const answerRaw = card.querySelector(".q-answer").value.trim();
        q.answer = answerRaw.split(",").map((s) => s.trim()).filter(Boolean);
      }

      questions.push(q);
    }

    return { show_answer: showAnswer, questions };
  }

  function showLinkMessage(message, isError) {
    const linkOutput = document.getElementById("link-output");
    const linkMessage = document.getElementById("link-message");
    const linkInput = document.getElementById("quiz-link");
    const copyBtn = document.getElementById("copy-link-btn");

    linkOutput.classList.remove("hidden");
    linkInput.classList.add("hidden");
    copyBtn.classList.add("hidden");

    linkMessage.textContent = message;
    linkMessage.classList.remove("hidden");
    linkMessage.classList.toggle("error", Boolean(isError));
  }

  function showGeneratedLink(url) {
    const linkOutput = document.getElementById("link-output");
    const linkMessage = document.getElementById("link-message");
    const linkInput = document.getElementById("quiz-link");
    const copyBtn = document.getElementById("copy-link-btn");

    linkOutput.classList.remove("hidden");
    linkInput.value = url;
    linkInput.classList.remove("hidden");
    copyBtn.classList.remove("hidden");

    linkMessage.textContent = "";
    linkMessage.classList.add("hidden");
    linkMessage.classList.remove("error");
  }

  function generateLink() {
    const data = buildQuizData();
    if (data.questions.length === 0) {
      showLinkMessage("Add at least one question with text.", true);
      return;
    }

    const invalidMultipleResponse = data.questions.some(
      (q) => q.type === "multiple_response" && (q.options.length < 2 || q.answer.length === 0)
    );
    if (invalidMultipleResponse) {
      showLinkMessage(
        "Each multiple-response question needs at least 2 options and 1 correct checkbox selected.",
        true
      );
      return;
    }

    const invalidMultipleChoice = data.questions.some(
      (q) => q.type === "multiple_choice" && (q.options.length < 2 || q.answer.length !== 1)
    );
    if (invalidMultipleChoice) {
      showLinkMessage(
        "Each multiple-choice question needs at least 2 options and exactly 1 correct checkbox selected.",
        true
      );
      return;
    }

    const invalidNumerical = data.questions.some(
      (q) =>
        q.type === "numerical" &&
        (q.answer.length === 0 || q.answer.some((value) => !isNumericValue(value)))
    );
    if (invalidNumerical) {
      showLinkMessage(
        "Each numerical question needs one or more valid numbers (decimals allowed).",
        true
      );
      return;
    }

    const compressed = compressQuiz(data);
    const url = window.location.origin + window.location.pathname + "#" + compressed;
    showGeneratedLink(url);
  }

  function copyLink() {
    const input = document.getElementById("quiz-link");
    navigator.clipboard.writeText(input.value).then(() => {
      const btn = document.getElementById("copy-link-btn");
      btn.textContent = "Copied!";
      setTimeout(() => (btn.textContent = "Copy"), 2000);
    });
  }

  // =============================================
  //  QUIZ HOST
  // =============================================
  let quizData = null;
  let currentQuestion = 0;
  let score = 0;
  let answers = [];

  function showQuizView(hash) {
    document.getElementById("creator-view").classList.add("hidden");
    document.getElementById("quiz-view").classList.remove("hidden");

    try {
      quizData = decompressQuiz(hash);
    } catch {
      document.getElementById("quiz-start").innerHTML =
        "<h1>Invalid Quiz</h1><p>The quiz link appears to be broken or corrupted.</p>" +
        '<a href="' + window.location.pathname + '" class="btn btn-primary">Create a Quiz</a>';
      return;
    }

    document.getElementById("quiz-info").textContent =
      quizData.questions.length + " question" + (quizData.questions.length !== 1 ? "s" : "");
    document.getElementById("start-quiz-btn").onclick = startQuiz;
    document.getElementById("create-new-link").href = window.location.pathname;
  }

  function startQuiz() {
    currentQuestion = 0;
    score = 0;
    answers = [];
    document.getElementById("quiz-start").classList.add("hidden");
    document.getElementById("quiz-results").classList.add("hidden");
    document.getElementById("quiz-question").classList.remove("hidden");
    showQuestion();
  }

  function showQuestion() {
    const q = quizData.questions[currentQuestion];
    document.getElementById("progress-text").textContent =
      "Question " + (currentQuestion + 1) + " of " + quizData.questions.length;
    document.getElementById("question-text").textContent = q.question;

    // Image
    const img = document.getElementById("question-image");
    if (q.image) {
      img.src = q.image;
      img.classList.remove("hidden");
    } else {
      img.classList.add("hidden");
      img.src = "";
    }

    // Answer area
    const area = document.getElementById("answer-area");
    area.innerHTML = "";

    if (q.type === "multiple_response" || q.type === "multiple_choice") {
      const optionsToRender = Array.isArray(q.options) ? q.options.slice() : [];
      if (q.randomize_options) {
        shuffleArray(optionsToRender);
      }

      optionsToRender.forEach((opt) => {
        const btn = document.createElement("button");
        btn.className = "mc-option";
        btn.textContent = opt;
        btn.onclick = () => {
          if (q.type === "multiple_choice") {
            area.querySelectorAll(".mc-option").forEach((b) => b.classList.remove("selected"));
            btn.classList.add("selected");
          } else {
            btn.classList.toggle("selected");
          }
        };
        area.appendChild(btn);
      });
    } else if (q.type === "numerical") {
      const input = document.createElement("input");
      input.type = "number";
      input.step = "any";
      input.id = "numerical-answer-input";
      input.placeholder = "Type a number";
      area.appendChild(input);
    } else {
      const input = document.createElement("input");
      input.type = "text";
      input.id = "text-answer-input";
      input.placeholder = "Type your answer";
      area.appendChild(input);
    }

    // Reset buttons / feedback
    document.getElementById("feedback").classList.add("hidden");
    document.getElementById("feedback").className = "hidden";
    document.getElementById("next-question-btn").classList.add("hidden");
    document.getElementById("submit-answer-btn").classList.remove("hidden");
    document.getElementById("submit-answer-btn").onclick = submitAnswer;
  }

  function submitAnswer() {
    const q = quizData.questions[currentQuestion];
    let userAnswer = "";
    let userAnswers = [];

    if (q.type === "multiple_choice") {
      const selected = document.querySelector("#answer-area .mc-option.selected");
      if (!selected) return;
      userAnswer = selected.textContent;
      userAnswers = [userAnswer];
    } else if (q.type === "multiple_response") {
      const selected = Array.from(document.querySelectorAll("#answer-area .mc-option.selected"));
      if (selected.length === 0) return;

      userAnswers = selected.map((item) => item.textContent);
      userAnswer = userAnswers.join(", ");
    } else if (q.type === "numerical") {
      const input = document.getElementById("numerical-answer-input");
      const rawAnswer = input.value.trim();
      if (!isNumericValue(rawAnswer)) return;

      userAnswer = String(Number(rawAnswer));
      userAnswers = [userAnswer];
    } else {
      const input = document.getElementById("text-answer-input");
      userAnswer = input.value.trim();
      if (!userAnswer) return;
      userAnswers = [userAnswer];
    }

    let isCorrect = false;
    if (q.type === "multiple_response") {
      const normalizedSelected = Array.from(new Set(userAnswers.map((a) => a.toLowerCase().trim())));
      const normalizedExpected = Array.from(new Set(q.answer.map((a) => a.toLowerCase().trim())));
      const expectedSet = new Set(normalizedExpected);

      isCorrect =
        normalizedSelected.length === normalizedExpected.length &&
        normalizedSelected.every((a) => expectedSet.has(a));
    } else if (q.type === "numerical") {
      const userNumber = Number(userAnswer);
      const expectedNumbers = q.answer
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value));
      const tolerance = 1e-9;

      isCorrect = expectedNumbers.some((value) => Math.abs(value - userNumber) <= tolerance);
    } else {
      isCorrect = q.answer.some((a) => a.toLowerCase() === userAnswer.toLowerCase());
    }

    if (isCorrect) score++;
    answers.push({ question: q.question, userAnswer, correct: isCorrect, expected: q.answer });

    document.getElementById("submit-answer-btn").classList.add("hidden");

    if (quizData.show_answer) {
      const fb = document.getElementById("feedback");
      fb.classList.remove("hidden", "correct", "incorrect");
      if (isCorrect) {
        fb.classList.add("correct");
        fb.textContent = "Correct!";
      } else {
        fb.classList.add("incorrect");
        fb.textContent = "Incorrect. Correct answer(s): " + q.answer.join(", ");
      }
    }

    if (currentQuestion < quizData.questions.length - 1) {
      const nextBtn = document.getElementById("next-question-btn");
      nextBtn.classList.remove("hidden");
      nextBtn.onclick = () => {
        currentQuestion++;
        showQuestion();
      };
      // If not showing answers, auto-advance
      if (!quizData.show_answer) {
        currentQuestion++;
        showQuestion();
      }
    } else {
      if (quizData.show_answer) {
        const nextBtn = document.getElementById("next-question-btn");
        nextBtn.classList.remove("hidden");
        nextBtn.textContent = "See Results";
        nextBtn.onclick = showResults;
      } else {
        showResults();
      }
    }
  }

  function showResults() {
    document.getElementById("quiz-question").classList.add("hidden");
    document.getElementById("quiz-results").classList.remove("hidden");
    document.getElementById("score-text").textContent =
      "You scored " + score + " out of " + quizData.questions.length;

    const breakdown = document.getElementById("results-breakdown");
    breakdown.innerHTML = "";
    answers.forEach((a, i) => {
      const div = document.createElement("div");
      div.className = "result-item " + (a.correct ? "correct" : "incorrect");
      div.innerHTML =
        '<div class="result-question">' + (i + 1) + ". " + escapeHtml(a.question) + "</div>" +
        '<div class="result-answer">Your answer: ' + escapeHtml(a.userAnswer) +
        (a.correct ? " ✓" : " ✗ (Correct: " + escapeHtml(a.expected.join(", ")) + ")") +
        "</div>";
      breakdown.appendChild(div);
    });

    document.getElementById("restart-btn").onclick = startQuiz;
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  // --- Init ---
  window.addEventListener("hashchange", route);
  route();
})();
