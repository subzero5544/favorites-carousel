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
    getThumbnailUrl,
} from '/script.js';
import { getParsedUA } from '/scripts/RossAscends-mods.js';
// No direct invocation of group logic here – rely on SillyTavern's global
// delegated handlers instead.
import { debounce } from '/scripts/utils.js';

/**
 * @typedef {object} Entity
 * @property {number} id
 * @property {object} item
 * @property {string} type
 */

/**
 * @returns {Entity[]}
 */
const getEntitiesList = exportedGetEntitiesList || window.getEntitiesList;

// JQuery
const $ = window.jQuery;

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
    const container = $('#favorites_carousel');
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

    const $carouselEl = $('#favorites_carousel');

    buildExtensionAvatarList(container, favs);

    /* ---------------------------------------------------------- */
    /*   Make the favourites carousel scroll infinitely (wrap)     */
    /* ---------------------------------------------------------- */

    makeInfiniteScroll($('#favorites_carousel'));
    // Rely on the globally delegated click handlers for `.character_select` and
    // `.group_select` elements defined by SillyTavern itself. Adding our own
    // handler here would invoke `selectCharacterById` / `openGroupById` **twice**
    // (once via the delegated handler, once via this extension), which is what
    // caused the duplicated-message bug when switching between chats of very
    // different lengths. Therefore we merely ensure any stale handler of ours
    // is removed.
    container.find('.avatar').off('click.carousel');

    const $imgs = $('#favorites_carousel img');
    $imgs.off('load.updateArrow').on('load.updateArrow', setupFavoritesCarousel);
    setupFavoritesCarousel();

    // For infinite scrolling we reset the scroll position inside
    // makeInfiniteScroll(), so we no longer need to restore the previous ratio.

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

/**
 * Duplicates the carousel items to the left and right so that scrolling can
 * wrap seamlessly. When the user scrolls past one copy, we jump the scroll
 * position back by exactly one set width so they never notice the boundary.
 *
 * @param {JQuery<HTMLElement>} $carousel jQuery element for the carousel
 */
function makeInfiniteScroll($carousel) {
    if ($carousel.length === 0) return;

    // Remove any previous clones to avoid exponential growth after rebuilds
    $carousel.children('.inf_clone').remove();

    const $items = $carousel.children().not('.inf_clone');
    const itemCount = $items.length;
    if (itemCount === 0) return;

    // Clone one full set and prepend/append
    const prependClones = $items.clone().addClass('inf_clone');
    const appendClones  = $items.clone().addClass('inf_clone');
    $carousel.prepend(prependClones);
    $carousel.append(appendClones);

    // Calculate width of one logical set (all originals)
    let setWidth = 0;
    $items.each(function() {
        setWidth += $(this).outerWidth(true);
    });

    // Position scroll at the start of the original set
    $carousel.scrollLeft(setWidth);

    // Debounce scroll correction so we aren't too aggressive
    let ticking = false;
    function onScroll() {
        if (ticking) return;
        ticking = true;
        window.requestAnimationFrame(() => {
            const left = $carousel[0].scrollLeft;
            if (left < setWidth * 0.5) {
                $carousel[0].scrollLeft = left + setWidth;
            } else if (left > setWidth * 1.5) {
                $carousel[0].scrollLeft = left - setWidth;
            }
            ticking = false;
        });
    }

    // Replace previous infinite scroll handler, if any
    $carousel.off('scroll.infinite').on('scroll.infinite', onScroll);
}

function setupFavoritesCarousel() {
    const $wrapper = $('#favorites_carousel_wrapper');
    const $carousel = $('#favorites_carousel');
    const $left = $('#favorites_carousel_left');
    const $right = $('#favorites_carousel_right');

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

    $(window).off('resize.favCarousel').on('resize.favCarousel', updateArrowVisibility);
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

    // Initial pass to set arrow visibility.
    updateArrowVisibility();

    /* ---------------------------------------------------------- */
    /*  Detect missing group collage images and retry once later   */
    /* ---------------------------------------------------------- */

    if ($carousel.find('.avatar_collage img[src=""]').length) {
        if (!setupFavoritesCarousel._retryScheduled) {
            setupFavoritesCarousel._retryScheduled = true;
            setTimeout(() => {
                // Rebuild carousel once more after data likely loaded
                favsToHotswap();
                setupFavoritesCarousel._retryScheduled = false;
            }, 800);
        }
    }
}

// ---------------------------------------------------------------------------
// Enable / disable helpers
// ---------------------------------------------------------------------------
let initialTimer = null;
let observer = null;

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
    eventSource.on(event_types.CHARACTER_EDITED, favsToHotswap);

    const debouncedFavsToHotswap = debounce(favsToHotswap, 100);
    const observerConfig = { attributes: true, attributeFilter: ['class'] };
    observer = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
            if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                debouncedFavsToHotswap();
            }
        });
    });

    const observerInterval = setInterval(() => {
        const groupTargetNode = document.querySelector('#group_favorite_button');
        if (groupTargetNode) {
            observer.observe(groupTargetNode, observerConfig);
        }
    }, 500);
}

export function disable() {
    const OLD_HOTSWAP_ID = 'HotSwapWrapper';
    $('#favorites_carousel_wrapper').remove();
    eventSource.off(event_types.CHARACTER_EDITED, favsToHotswap);
    if (observer) {
        observer.disconnect();
    }
    clearInterval(initialTimer);
    const oldHotswap = document.getElementById(OLD_HOTSWAP_ID);
    if (oldHotswap) oldHotswap.style.display = '';
}

enable();

// ---------------------------------------------------------------------------
// Fallback buildAvatarList (Corrected for /thumbnail endpoint)
// ---------------------------------------------------------------------------
function buildExtensionAvatarList($container, entries) {
    $container.empty();
    for (const { id, item, type } of entries) {
        const isGroup = type === 'group';
        const title = item?.name ?? '???';
        const $div = $('<div>', { class: 'avatar character_select', title });

        if (isGroup) {
            $div.addClass('avatar_collage group_select');
            $div.attr('data-grid', id);
            $div.data('type', 'group');

            if (Array.isArray(item.members)) {
                $div.addClass(`collage_${item.members.length}`);
                for (let i = 0; i < item.members.length; i++) {
                    const member = item.members[i];
                    const avatarUrl = getThumbnailUrl('avatar', member);
                    $div.append($('<img>', { src: avatarUrl, alt: `img${i+1}`, class: `img_${i+1}` }));
                }
            }
        } else {
            const avatarUrl = getThumbnailUrl('avatar', item.avatar);
            $div.attr('data-chid', id);
            $div.append($('<img>', { src: avatarUrl, alt: title }));
        }
        $container.append($div);
    }
}

function isMobile() {
    const mobileTypes = ['mobile', 'tablet'];
    const parsedUA = getParsedUA?.();
    return parsedUA?.platform?.type && mobileTypes.includes(parsedUA.platform.type);
}