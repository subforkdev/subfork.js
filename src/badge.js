/*
Copyright (c) Subfork. All rights reserved.
*/

(function() {
    function createAttributionBadge() {
        // Create the badge container
        const badge = document.createElement("div");
        badge.className = "attribution-badge";

        // Create the image element
        const image = document.createElement("img");
        image.src = "https://subfork.com/static/logo.png";
        image.title = "Built with Subfork";
        image.alt = "Subfork";
        image.className = "attribution-image";

        // Add click event listener
        image.addEventListener("click", () => {
            window.open("https://subfork.com", "_blank");
        });

        // Append the image to the badge container
        badge.appendChild(image);

        // Append the badge container to the body
        document.body.appendChild(badge);

        // Style the badge using CSS
        const style = document.createElement("style");
        style.textContent = `
            .attribution-badge {
                position: fixed;
                bottom: 10px;
                right: 10px;
                background-color: rgba(0.2, 0.2, 0.25, 0.25);
                padding: 5px 10px 2px 10px;
                border-radius: 12px;
                z-index: 1000;
            }
            .attribution-image {
                width: 80px;
                cursor: pointer;
            }
        `;
        document.head.appendChild(style);
    }

    // Automatically create the badge when loaded
    document.addEventListener("DOMContentLoaded", createAttributionBadge);
})();
