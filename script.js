/* Get references to DOM elements */
const categoryFilter = document.getElementById("categoryFilter");
const productsContainer = document.getElementById("productsContainer");
const chatForm = document.getElementById("chatForm");
const chatWindow = document.getElementById("chatWindow");
chatWindow.setAttribute("aria-live", "polite");

// Cloudflare Worker URL --- this is for the API
const workerUrl = 'https://dawn-bush-18a4.ppvang.workers.dev/';

/* Show initial placeholder until user selects a category */
productsContainer.innerHTML = `
  <div class="placeholder-message">
    Select a category to view products
  </div>
`;

/* Load product data from JSON file */
async function loadProducts() {
  const response = await fetch("products.json");
  const data = await response.json();
  return data.products;
}

/* Create HTML for displaying product cards */
function displayProducts(products) {
  productsContainer.innerHTML = products
    .map(
      (product) => `
    <div class="product-card">
      <img src="${product.image}" alt="${product.name}">
      <div class="product-info">
        <h3>${product.name}</h3>
        <p>${product.brand}</p>
      </div>
    </div>
  `
    )
    .join("");
  displaySelectableProducts(products);
}

/* Filter and display products when category changes */
categoryFilter.addEventListener("change", async (e) => {
  const products = await loadProducts();
  const selectedCategory = e.target.value;

  /* filter() creates a new array containing only products 
     where the category matches what the user selected */
  const filteredProducts = products.filter(
    (product) => product.category === selectedCategory
  );

  displayProducts(filteredProducts);
});

/* Chat form submission handler - placeholder for OpenAI integration */
chatForm.addEventListener("submit", (e) => {
  e.preventDefault();

  chatWindow.innerHTML = "Connect to the OpenAI API for a response!";
});

// Keep product selection and conversation state separate from the starter handlers above.
const selectedProductsList = document.getElementById("selectedProductsList");
const clearSelectionsButton = document.getElementById("clearSelections");
const generateRoutineButton = document.getElementById("generateRoutine");
const userInput = document.getElementById("userInput");
const sendButton = document.getElementById("sendBtn");
const selectionStorageKey = "lorealSelectedProductIds";
const selectedProducts = new Map();
let allProducts = [];
let hasGeneratedRoutine = false;
let requestInProgress = false;
const conversationMessages = [
  {
    role: "system",
    content:
      "You are a helpful beauty advisor. Discuss the generated routine and related skincare, haircare, makeup, fragrance, and beauty topics only. If asked about unrelated topics, politely redirect the conversation to beauty. Use only the selected product details when recommending specific products. Do not make medical diagnoses; recommend a qualified professional for medical concerns.",
  },
];

// Escape product text before placing it in the product-card markup.
function escapeProductText(value) {
  return String(value || "").replace(/[&<>"']/g, (character) => {
    const replacements = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return replacements[character];
  });
}

// Draw selectable product cards with an expandable description.
function displaySelectableProducts(products) {
  productsContainer.innerHTML = products
    .map((product) => {
      const productId = String(product.id);
      const isSelected = selectedProducts.has(productId);
      return `
        <article class="product-card ${isSelected ? "is-selected" : ""}" data-product-id="${escapeProductText(productId)}">
          <img src="${escapeProductText(product.image)}" alt="${escapeProductText(product.name)}">
          <div class="product-info">
            <button class="product-select-button" type="button" role="checkbox" aria-checked="${isSelected}">
              <span class="product-name">${escapeProductText(product.name)}</span>
              <span class="product-brand">${escapeProductText(product.brand)}</span>
              <span class="selection-hint">${isSelected ? "Selected" : "Select product"}</span>
            </button>
            <details class="product-description">
              <summary>Product details</summary>
              <p>${escapeProductText(product.description)}</p>
            </details>
          </div>
        </article>
      `;
    })
    .join("");
}

// Refresh the saved list and keep the selected IDs in localStorage.
function updateSelectedProducts() {
  const products = [...selectedProducts.values()];
  selectedProductsList.innerHTML = products.length
    ? products
        .map(
          (product) => `
            <div class="selected-product-item">
              <span>${escapeProductText(product.name)}</span>
              <button class="remove-selected-product" type="button" data-product-id="${escapeProductText(product.id)}" aria-label="Remove ${escapeProductText(product.name)}">
                <i class="fa-solid fa-xmark" aria-hidden="true"></i>
              </button>
            </div>
          `
        )
        .join("")
    : '<p class="empty-selection">No products selected yet.</p>';

  clearSelectionsButton.disabled = products.length === 0;
  try {
    localStorage.setItem(selectionStorageKey, JSON.stringify(products.map((product) => product.id)));
  } catch (error) {
    console.warn("Product selections could not be saved in this browser.", error);
  }

  if (categoryFilter.value) {
    const visibleProducts = allProducts.filter(
      (product) => product.category === categoryFilter.value
    );
    displaySelectableProducts(visibleProducts);
  }
}

// Render the full conversation as text so model output is not treated as HTML.
function displayConversation() {
  chatWindow.innerHTML = "";
  conversationMessages.slice(1).forEach((message) => {
    const messageElement = document.createElement("p");
    messageElement.className = `chat-message ${message.role}-message`;
    messageElement.textContent = message.content;
    chatWindow.appendChild(messageElement);
  });
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

// Show a readable status without adding it to the conversation sent to the Worker.
function showChatNotice(message) {
  const notice = document.createElement("p");
  notice.className = "chat-notice";
  notice.textContent = message;
  chatWindow.appendChild(notice);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

// Send the complete message history to the class-hosted Cloudflare Worker.
async function requestBeautyAdvisorReply() {
  const response = await fetch(workerUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: conversationMessages }),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message || `Worker request failed (${response.status}).`);
  }

  const reply =
    data.choices?.[0]?.message?.content || data.reply || data.response;
  if (!reply) {
    throw new Error("The Worker response did not include a reply.");
  }
  conversationMessages.push({ role: "assistant", content: reply });
  displayConversation();
}

// Load saved product IDs and render the product category currently on screen.
async function initializeProductSelection() {
  try {
    allProducts = await loadProducts();
    let savedProductIds = [];
    try {
      savedProductIds = JSON.parse(localStorage.getItem(selectionStorageKey) || "[]");
    } catch (error) {
      console.warn("Saved product selections could not be read.", error);
    }

    if (Array.isArray(savedProductIds)) {
      allProducts
        .filter((product) => savedProductIds.includes(product.id))
        .forEach((product) => selectedProducts.set(String(product.id), product));
    }
    updateSelectedProducts();
  } catch (error) {
    productsContainer.innerHTML = '<p class="placeholder-message">Products could not be loaded. Please refresh the page.</p>';
    console.error("Products could not be loaded.", error);
  }
}

// Re-render enhanced cards after the existing category filter runs.
categoryFilter.addEventListener("change", async () => {
  try {
    if (allProducts.length === 0) {
      allProducts = await loadProducts();
    }
    const visibleProducts = allProducts.filter(
      (product) => product.category === categoryFilter.value
    );
    displaySelectableProducts(visibleProducts);
  } catch (error) {
    productsContainer.innerHTML =
      '<p class="placeholder-message">Products could not be loaded. Please try again or open the project using a local web server.</p>';
    console.error("Products could not be loaded for this category.", error);
  }
});

// Clicking a card toggles selection, while the details disclosure stays independent.
productsContainer.addEventListener("click", (event) => {
  if (event.target.closest(".product-description")) {
    return;
  }
  const productCard = event.target.closest(".product-card");
  if (!productCard) {
    return;
  }

  const productId = productCard.dataset.productId;
  if (selectedProducts.has(productId)) {
    selectedProducts.delete(productId);
  } else {
    const product = allProducts.find((item) => String(item.id) === productId);
    if (product) {
      selectedProducts.set(productId, product);
    }
  }
  updateSelectedProducts();
});

// Remove a single product or clear all saved selections.
selectedProductsList.addEventListener("click", (event) => {
  const removeButton = event.target.closest(".remove-selected-product");
  if (removeButton) {
    selectedProducts.delete(removeButton.dataset.productId);
    updateSelectedProducts();
  }
});

clearSelectionsButton.addEventListener("click", () => {
  selectedProducts.clear();
  updateSelectedProducts();
});

// Generate a routine using only the currently selected product details.
generateRoutineButton.addEventListener("click", async () => {
  if (requestInProgress) {
    return;
  }
  const productDetails = [...selectedProducts.values()].map((product) => ({
    name: product.name,
    brand: product.brand,
    category: product.category,
    description: product.description,
  }));

  if (productDetails.length === 0) {
    showChatNotice("Select at least one product before generating a routine.");
    return;
  }

  hasGeneratedRoutine = false;
  conversationMessages.splice(1);
  conversationMessages.push({
    role: "user",
    content: `Create a personalized routine using only the selected products. Explain a sensible order and when to use each product.\n\nSelected product data:\n${JSON.stringify(productDetails, null, 2)}`,
  });
  displayConversation();

  requestInProgress = true;
  generateRoutineButton.disabled = true;
  try {
    await requestBeautyAdvisorReply();
    hasGeneratedRoutine = true;
  } catch (error) {
    showChatNotice(`The routine could not be generated: ${error.message}`);
  } finally {
    requestInProgress = false;
    generateRoutineButton.disabled = false;
  }
});

// Keep follow-up questions in the same conversation after a routine is generated.
chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const question = userInput.value.trim();
  if (!question || requestInProgress) {
    return;
  }
  if (!hasGeneratedRoutine) {
    showChatNotice("Generate a routine first, then ask a follow-up question.");
    return;
  }

  conversationMessages.push({ role: "user", content: question });
  userInput.value = "";
  displayConversation();
  requestInProgress = true;
  sendButton.disabled = true;
  try {
    await requestBeautyAdvisorReply();
  } catch (error) {
    showChatNotice(`The reply could not be loaded: ${error.message}`);
  } finally {
    requestInProgress = false;
    sendButton.disabled = false;
  }
});

initializeProductSelection();
