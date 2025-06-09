/*
 * Favorites Carousel extension for legacy SillyTavern builds
 * (Definitive version with instant favorite updates)
 */

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------
import {
    eventSource,
    event_types,
    getEntitiesList as exportedGetEntitiesList,
} from '/script.js';
import { isMobile } from '/scripts/RossAscends-mods.js';
const getEntitiesList = exportedGetEntitiesList || window.getEntitiesList;

// ---------------------------------------------------------------------------
// State variables
// ---------------------------------------------------------------------------
let favoritesCarouselScrollRatio = 0;
let favoritesCarouselRestoring   = false;

// ---------------------------------------------------------------------------
// Ensure HTML exists
// ---------------------------------------------------------------------------
function ensureHtml() {
    if (document.getElementById('favorites_carousel_wrapper')) return;
    const wrapper = document.createElement('div');
    wrapper.id = 'favorites_carousel_wrapper';
    wrapper.className = 'alignitemscenter flex-container margin0auto wide100p';
    wrapper.innerHTML = `
        <div id="favorites_carousel_left"  class="carousel-arrow" title="Scroll left"><i class="fa-solid fa-chevron-left"></i></div>
        <div id="favorites_carousel" class="favorites_carousel scroll-reset-container expander" data-i18n="[no_favs]Favorite characters to add them to HotSwaps" no_favs="Favorite characters to add them to HotSwaps"></div>
        <div id="favorites_carousel_right" class="carousel-arrow" title="Scroll right"><i class="fa-solid fa-chevron-right"></i></div>
    `;
    const buttonDiv = document.getElementById('rm_button_characters');
    if (buttonDiv && buttonDiv.parentNode && buttonDiv.parentNode.parentNode) {
        buttonDiv.parentNode.parentNode.insertBefore(wrapper, buttonDiv.parentNode.nextSibling);
    } else {
        document.body.appendChild(wrapper);
    }
}

// ---------------------------------------------------------------------------
// Core functions
// ---------------------------------------------------------------------------
function favsToHotswap() {
    const OLD_HOTSWAP_ID = 'HotSwapWrapper';
    const entities = getEntitiesList ? getEntitiesList({ doFilter: false }) : [];
    const container = window.$('#favorites_carousel');
    const FAVS_LIMIT = 999;
    const favs = entities.filter((x) => x.item.fav || x.item.fav == 'true').slice(0, FAVS_LIMIT);
    const oldHotswap = document.getElementById(OLD_HOTSWAP_ID);

    if (favs.length === 0) {
        const msg = container.attr('no_favs') || 'Favorite characters to add them to HotSwaps';
        container.html(`<small><span><i class="fa-solid fa-star"></i> ${msg}</span></small>`);
        if (oldHotswap) oldHotswap.style.display = '';
        return;
    }

    if (oldHotswap) oldHotswap.style.display = 'none';

    const $carouselEl = window.$('#favorites_carousel');
    const prevRatio = favoritesCarouselScrollRatio;

    window.buildAvatarList(container, favs, { interactable: true, highlightFavs: false });
    container.find('.avatar').off('click.carousel').on('click.carousel', function () {
        const id = Number(window.$(this).attr('data-chid'));
        if (typeof window.selectCharacterById === 'function') {
            window.selectCharacterById(String(id));
        }
    });

    const $imgs = window.$('#favorites_carousel img');
    $imgs.off('.thumbFallback').on('error.thumbFallback', function () {
        const $div = window.$(this).closest('.avatar');
        const idx = Number($div.data('id'));
        const ch = favs[idx]?.item;
        if (!ch) return;
        let alt = ch.avatar || ch.avatar_url || ch.img || '';
        if (alt && !/^\//.test(alt) && !/^[a-z]+:\/\//i.test(alt)) {
            alt = `/characters/${encodeURIComponent(alt)}`;
        }
        this.src = (alt && this.src !== alt) ? alt : '/img/ai4.png';
    });

    $imgs.off('load.updateArrow').on('load.updateArrow', setupFavoritesCarousel);
    setupFavoritesCarousel();

    function restoreScrollPosition() {
        favoritesCarouselRestoring = true;
        const maxScroll = $carouselEl[0].scrollWidth - $carouselEl.innerWidth();
        const restored = maxScroll > 0 ? Math.round(prevRatio * maxScroll) : 0;
        $carouselEl.scrollLeft(restored);
        $carouselEl.trigger('scroll');
        favoritesCarouselRestoring = false;
    }

    setTimeout(restoreScrollPosition, 0);

    let attempts = 0;
    const renderCheckInterval = setInterval(() => {
        const el = $carouselEl[0];
        if (el && (el.scrollWidth > el.clientWidth + 1 || attempts > 30)) {
            setupFavoritesCarousel();
            clearInterval(renderCheckInterval);
        }
        attempts++;
    }, 100);
}

function setupFavoritesCarousel() {
    const $wrapper = window.$('#favorites_carousel_wrapper');
    const $carousel = window.$('#favorites_carousel');
    const $left = window.$('#favorites_carousel_left');
    const $right = window.$('#favorites_carousel_right');

    const mobileEnv = isMobile();
    $carousel.toggleClass('mobile', mobileEnv).toggleClass('desktop', !mobileEnv);
    if ($carousel.length === 0) return;

    const firstItem = $carousel.find('.avatar').first();
    const scrollStep = firstItem.length ? firstItem.outerWidth(true) : 100;

    function updateArrowVisibility() {
        if (mobileEnv) return;
        const el = $carousel[0];
        const contentWidth = el.scrollWidth;
        const viewWidth = el.clientWidth;
        const maxScroll = contentWidth - viewWidth;
        const overflow = contentWidth > viewWidth + 1;

        $left.css('display', overflow ? 'block' : 'none');
        $right.css('display', overflow ? 'block' : 'none');
        $wrapper.toggleClass('with-arrows', overflow);
        $left.toggleClass('disabled', $carousel.scrollLeft() <= 0);
        $right.toggleClass('disabled', $carousel.scrollLeft() >= maxScroll - 1);
    }

    $left.off('.favCarousel').on('click.favCarousel', () => {
        $carousel.animate({ scrollLeft: $carousel.scrollLeft() - scrollStep }, 200);
    });
    $right.off('.favCarousel').on('click.favCarousel', () => {
        $carousel.animate({ scrollLeft: $carousel.scrollLeft() + scrollStep }, 200);
    });

    window.$(window).off('resize.favCarousel').on('resize.favCarousel', updateArrowVisibility);
    $carousel.off('scroll.favCarousel').on('scroll.favCarousel', updateArrowVisibility);
    $carousel.off('scroll.favCarouselSave').on('scroll.favCarouselSave', () => {
        if (favoritesCarouselRestoring) return;
        const maxScroll = $carousel[0].scrollWidth - $carousel[0].clientWidth;
        favoritesCarouselScrollRatio = maxScroll <= 0 ? 0 : $carousel.scrollLeft() / maxScroll;
    });

    $carousel.off('wheel.favCarousel');
    if (!mobileEnv) {
        $carousel.on('wheel.favCarousel', function(e) {
            e.preventDefault();
            const oe = e.originalEvent;
            const delta = oe.deltaX !== 0 ? oe.deltaX : oe.deltaY;
            this.scrollLeft += delta;
        });
    }

    $carousel.find('img').off('load.favCarousel').on('load.favCarousel', updateArrowVisibility);
    updateArrowVisibility();
}

// ---------------------------------------------------------------------------
// Enable / disable helpers
// ---------------------------------------------------------------------------
let initialTimer = null;
function tryInitialBuild() {
    favsToHotswap();
    if (document.querySelector('#favorites_carousel .avatar')) {
        clearInterval(initialTimer);
    }
}

export function enable() {
    ensureHtml();
    initialTimer = setInterval(tryInitialBuild, 300);
    setTimeout(tryInitialBuild, 100);
    eventSource.on(event_types.CHARACTER_PAGE_LOADED, favsToHotswap);

    // NEW: Listen for character edits (favoriting) to trigger an instant refresh.
    eventSource.on(event_types.CHARACTER_EDITED, favsToHotswap);
}

export function disable() {
    const OLD_HOTSWAP_ID = 'HotSwapWrapper';
    window.$('#favorites_carousel_wrapper').remove();
    eventSource.off(event_types.CHARACTER_PAGE_LOADED, favsToHotswap);
    clearInterval(initialTimer);
    const oldHotswap = document.getElementById(OLD_HOTSWAP_ID);
    if (oldHotswap) oldHotswap.style.display = '';

    // NEW: Remove the character edit listener when the extension is disabled.
    eventSource.off(event_types.CHARACTER_EDITED, favsToHotswap);
}

enable();

// ---------------------------------------------------------------------------
// Fallback buildAvatarList (Corrected for /thumbnail endpoint)
// ---------------------------------------------------------------------------
if (typeof window.buildAvatarList === 'undefined') {
    window.buildAvatarList = function ($container, entries) {
        $container.empty();
        entries.forEach(({ id, item }) => {
            const rawFilename = item?.avatar || item?.avatar_url || item?.img || '';
            const title = item?.name || '???';
            const avatarUrl = rawFilename ? `/thumbnail?type=avatar&file=${encodeURIComponent(rawFilename)}` : '/img/ai4.png';
            const $div = window.$('<div>', { class: 'avatar character_select', 'data-chid': id, title });
            $div.append(window.$('<img>', { src: avatarUrl, alt: title }));
            if (typeof window.selectCharacterById === 'function') {
                $div.on('click', () => window.selectCharacterById(String(id)));
            }
            $container.append($div);
        });
    };
}