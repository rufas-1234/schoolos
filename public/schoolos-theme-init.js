try {
  if (window.localStorage.getItem("schoolos-theme") === "dark") {
    document.documentElement.classList.add("dark");
  }
} catch (error) {
  console.error("Could not load the saved theme preference.", error);
}
