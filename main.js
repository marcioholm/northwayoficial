// Initialize Icons using Lucide Globals (CDN)
if (window.lucide) {
    window.lucide.createIcons();
}

// Smooth Scroll
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        document.querySelector(this.getAttribute('href')).scrollIntoView({
            behavior: 'smooth'
        });
    });
});

// Navbar active state on scroll
const nav = document.querySelector('.nav');
window.addEventListener('scroll', () => {
    if (window.scrollY > 50) {
        nav.style.padding = '1rem 0';
        nav.style.background = 'rgba(2, 6, 23, 0.95)';
        nav.style.borderBottom = '1px solid rgba(239, 68, 68, 0.2)';
    } else {
        nav.style.padding = '1.5rem 0';
        nav.style.background = 'rgba(2, 6, 23, 0.8)';
        nav.style.borderBottom = '1px solid rgba(255, 255, 255, 0.1)';
    }
});

// Basic Scroll Reveal
const observerOptions = {
    threshold: 0.1
};

const observer = new MutationObserver(() => {
    // Reveal logic if needed for dynamic content
});

// Add animation classes manually or via intersection observer for performance
const cards = document.querySelectorAll('.glass-card');
const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
        }
    });
}, observerOptions);

cards.forEach(card => {
    card.style.opacity = '0';
    card.style.transform = 'translateY(20px)';
    card.style.transition = 'all 0.6s ease-out';
    revealObserver.observe(card);
});
