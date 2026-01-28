// S5 v1.1 slides.js -- released into the Public Domain
//
// Please see http://www.meyerweb.com/eric/tools/s5/credits.html for information
// about all the wonderful and talented contributors to this code!

(() => {
	'use strict';

	let snum = 0;
	let smax = 1;
	let incpos = 0;
	let number = null;
	let s5mode = true;
	let defaultView = 'slideshow';
	let controlVis = 'visible';
	let slides = [];
	let incrementals = [];
	let resizeRaf = 0;

	function hasValue(valueList, value) {
		if (typeof valueList !== 'string') return false;
		return valueList.split(/\s+/).includes(value);
	}

	function isParentOrSelf(element, id) {
		if (!element || element.nodeName === 'BODY') return false;
		if (element.id === id) return true;
		return isParentOrSelf(element.parentNode, id);
	}

	function cacheSlides() {
		slides = Array.from(document.querySelectorAll('.slide'));
		smax = slides.length;
	}

	function slideLabel() {
		const list = document.getElementById('jumplist');
		if (!list) return;
		list.textContent = '';
		smax = slides.length;
		for (let n = 0; n < smax; n++) {
			const obj = slides[n];
			const did = `slide${n}`;
			obj.id = did;

			const menu = obj.firstElementChild;
			if (!menu) continue; // cope with empty slides

			const otext = menu.textContent.trim();
			const option = document.createElement('option');
			option.value = n;
			option.textContent = `${n} : ${otext}`;
			list.appendChild(option);
		}
	}

	function currentSlide() {
		const cs = document.getElementById('currentSlide');
		if (!cs) return;
		cs.textContent = '';

		const here = document.createElement('span');
		here.id = 'csHere';
		here.textContent = snum;

		const sep = document.createElement('span');
		sep.id = 'csSep';
		sep.textContent = '/';

		const total = document.createElement('span');
		total.id = 'csTotal';
		total.textContent = smax - 1;

		cs.appendChild(here);
		cs.appendChild(document.createTextNode(' '));
		cs.appendChild(sep);
		cs.appendChild(document.createTextNode(' '));
		cs.appendChild(total);

		cs.style.visibility = snum === 0 ? 'hidden' : 'visible';
	}

	function go(step) {
		const slideProj = document.getElementById('slideProj');
		if ((slideProj && slideProj.disabled) || step === 0) return;

		const jl = document.getElementById('jumplist');
		const currentId = `slide${snum}`;
		const currentEl = document.getElementById(currentId);
		const currentIncrementals = incrementals[snum] || [];
		for (let i = 0; i < currentIncrementals.length; i++) {
			currentIncrementals[i].classList.remove('current', 'incremental');
		}

		if (step !== 'j') {
			snum += step;
			const lmax = smax - 1;
			if (snum > lmax) snum = lmax;
			if (snum < 0) snum = 0;
		} else if (jl) {
			snum = parseInt(jl.value, 10) || 0;
		}

		const nextId = `slide${snum}`;
		let nextEl = document.getElementById(nextId);
		if (!nextEl) {
			nextEl = document.getElementById('slide0');
			snum = 0;
		}

		incpos = step < 0 ? (incrementals[snum] || []).length : 0;
		const nextIncrementals = incrementals[snum] || [];
		if (nextIncrementals.length > 0 && incpos === 0) {
			for (let i = 0; i < nextIncrementals.length; i++) {
				if (nextIncrementals[i].classList.contains('current')) {
					incpos = i + 1;
				} else {
					nextIncrementals[i].classList.add('incremental');
				}
			}
		}
		if (nextIncrementals.length > 0 && incpos > 0) {
			nextIncrementals[incpos - 1].classList.add('current');
		}

		if (currentEl) {
			currentEl.classList.remove('active');
			currentEl.style.visibility = 'hidden';
		}
		if (nextEl) {
			nextEl.classList.add('active');
			nextEl.style.visibility = 'visible';
		}
		if (jl) jl.selectedIndex = snum;
		currentSlide();
		number = null;
	}

	function goTo(target) {
		if (target >= smax || target === snum) return;
		go(target - snum);
	}

	function subgo(step) {
		const currentIncrementals = incrementals[snum] || [];
		if (currentIncrementals.length === 0) return;
		if (step > 0) {
			const previous = currentIncrementals[incpos - 1];
			const current = currentIncrementals[incpos];
			if (previous) previous.classList.remove('current');
			if (current) {
				current.classList.remove('incremental');
				current.classList.add('current');
			}
			incpos++;
		} else {
			incpos--;
			const current = currentIncrementals[incpos];
			const previous = currentIncrementals[incpos - 1];
			if (current) {
				current.classList.remove('current');
				current.classList.add('incremental');
			}
			if (previous) previous.classList.add('current');
		}
	}

	function toggle() {
		const slideProj = document.getElementById('slideProj');
		const outline = document.getElementById('outlineStyle');
		if (!slideProj || !outline) return;
		if (!slideProj.disabled) {
			slideProj.disabled = true;
			outline.disabled = false;
			s5mode = false;
			fontSize('1em');
			for (let n = 0; n < smax; n++) {
				slides[n].style.visibility = 'visible';
				slides[n].classList.add('active');
			}
		} else {
			slideProj.disabled = false;
			outline.disabled = true;
			s5mode = true;
			fontScale();
			for (let n = 0; n < smax; n++) {
				slides[n].style.visibility = 'hidden';
				slides[n].classList.remove('active');
			}
			if (slides[snum]) {
				slides[snum].style.visibility = 'visible';
				slides[snum].classList.add('active');
			}
		}
	}

	function showHide(action) {
		const obj = document.querySelector('.hideme');
		if (!obj) return;
		switch (action) {
			case 's':
				obj.style.visibility = 'visible';
				break;
			case 'h':
				obj.style.visibility = 'hidden';
				break;
			case 'k':
				obj.style.visibility = obj.style.visibility !== 'visible' ? 'visible' : 'hidden';
				break;
			default:
				break;
		}
	}

	function isHandledKeyTarget(eventTarget) {
		if (!eventTarget) return false;
		return isParentOrSelf(eventTarget, 'controls');
	}

	// 'keys' code adapted from MozPoint (http://mozpoint.mozdev.org/)
	function keys(event) {
		if (!event) return false;
		const keyCode = event.keyCode || event.which || 0;
		const key = (event.key || '').toLowerCase();
		if (event.ctrlKey || event.altKey || event.metaKey) return false;

		if (key === 't' || keyCode === 84) {
			toggle();
			event.preventDefault();
			return false;
		}

		if (!s5mode) return false;

		switch (keyCode) {
			case 10: // return
			case 13: // enter
				if (isHandledKeyTarget(event.target || event.srcElement)) return false;
				if (number !== null) {
					goTo(number);
					break;
				}
				break;
			case 32: // spacebar
			case 34: // page down
			case 39: // rightkey
			case 40: // downkey
				if (number !== null) {
					go(number);
				} else if (!incrementals[snum] || incpos >= incrementals[snum].length) {
					go(1);
				} else {
					subgo(1);
				}
				event.preventDefault();
				break;
			case 33: // page up
			case 37: // leftkey
			case 38: // upkey
				if (number !== null) {
					go(-1 * number);
				} else if (!incrementals[snum] || incpos <= 0) {
					go(-1);
				} else {
					subgo(-1);
				}
				event.preventDefault();
				break;
			case 36: // home
				goTo(0);
				event.preventDefault();
				break;
			case 35: // end
				goTo(smax - 1);
				event.preventDefault();
				break;
			case 67: // c
				showHide('k');
				event.preventDefault();
				break;
			default:
				break;
		}

		if (keyCode < 48 || keyCode > 57) {
			number = null;
		} else {
			if (isHandledKeyTarget(event.target || event.srcElement)) return false;
			number = (number !== null ? number : 0) * 10 + (keyCode - 48);
		}
		return false;
	}

	function clicker(event) {
		number = null;
		const slideProj = document.getElementById('slideProj');
		if (slideProj && slideProj.disabled) return true;

		let target = event.target || event.srcElement;
		if (!target) return true;
		if (target.nodeType === 3) target = target.parentElement;
		if (!target) return true;

		const link = target.closest ? target.closest('a') : null;
		if (link && (link.getAttribute('href') !== null || hasValue(link.rel, 'external'))) return true;
		if (isParentOrSelf(target, 'controls')) return true;
		if (target.closest && target.closest('embed,object')) return true;

		if (!event.which || event.which === 1) {
			if (!incrementals[snum] || incpos >= incrementals[snum].length) {
				go(1);
			} else {
				subgo(1);
			}
		}
		return true;
	}

	function findSlide(hash) {
		let target = null;
		for (let i = 0; i < slides.length; i++) {
			const targetSlide = slides[i];
			if ((targetSlide.name && targetSlide.name === hash)
				|| (targetSlide.id && targetSlide.id === hash)) {
				target = targetSlide;
				break;
			}
		}
		while (target && target.nodeName !== 'BODY') {
			if (target.classList && target.classList.contains('slide')) {
				return parseInt(target.id.slice(5), 10);
			}
			target = target.parentNode;
		}
		return null;
	}

	function slideJump() {
		if (!window.location.hash) return;
		const matches = /^#slide(\d+)$/.exec(window.location.hash);
		let dest = null;
		if (matches) {
			dest = parseInt(matches[1], 10);
		} else {
			dest = findSlide(window.location.hash.slice(1));
		}
		if (dest !== null) go(dest - snum);
	}

	function fixLinks() {
		const aelements = document.getElementsByTagName('A');
		for (let i = 0; i < aelements.length; i++) {
			const anchor = aelements[i];
			const href = anchor.getAttribute('href');
			if (!href) continue;
			const match = href.match(/#slide(\d+)/);
			if (match && match[0].slice(0, 1) === '#') {
				const dest = findSlide(match[0].slice(1));
				if (dest !== null) {
					anchor.addEventListener('click', (event) => {
						const slideProj = document.getElementById('slideProj');
						if (slideProj && slideProj.disabled) return;
						go(dest - snum);
						event.preventDefault();
					}, true);
				}
			}
		}
	}

	function externalLinks() {
		const anchors = document.getElementsByTagName('a');
		for (let i = 0; i < anchors.length; i++) {
			const anchor = anchors[i];
			const hasExternalRel = anchor.relList
				? anchor.relList.contains('external')
				: hasValue(anchor.rel, 'external');
			if (anchor.getAttribute('href') && hasExternalRel) {
				anchor.target = '_blank';
				anchor.classList.add('external');
			}
		}
	}

	function createControls() {
		const controlsDiv = document.getElementById('controls');
		if (!controlsDiv) return;
		controlsDiv.textContent = '';

		const form = document.createElement('form');
		form.id = 'controlForm';
		form.action = '#';

		const navLinks = document.createElement('div');
		navLinks.id = 'navLinks';

		const toggleLink = document.createElement('a');
		toggleLink.id = 'toggle';
		toggleLink.accessKey = 't';
		toggleLink.href = '#';
		toggleLink.textContent = '\u00d8';
		toggleLink.addEventListener('click', (event) => {
			event.preventDefault();
			toggle();
		});

		const prevLink = document.createElement('a');
		prevLink.id = 'prev';
		prevLink.accessKey = 'z';
		prevLink.href = '#';
		prevLink.textContent = '\u00ab';
		prevLink.addEventListener('click', (event) => {
			event.preventDefault();
			go(-1);
		});

		const nextLink = document.createElement('a');
		nextLink.id = 'next';
		nextLink.accessKey = 'x';
		nextLink.href = '#';
		nextLink.textContent = '\u00bb';
		nextLink.addEventListener('click', (event) => {
			event.preventDefault();
			go(1);
		});

		const navList = document.createElement('div');
		navList.id = 'navList';
		const jumpList = document.createElement('select');
		jumpList.id = 'jumplist';
		jumpList.addEventListener('change', () => go('j'));
		navList.appendChild(jumpList);

		navLinks.appendChild(toggleLink);
		navLinks.appendChild(prevLink);
		navLinks.appendChild(nextLink);
		navLinks.appendChild(navList);
		form.appendChild(navLinks);
		controlsDiv.appendChild(form);

		const hiddenElement = controlVis === 'hidden' ? navLinks : jumpList;
		hiddenElement.classList.add('hideme');

		const hoverTarget = controlVis === 'hidden' ? form : navList;
		hoverTarget.addEventListener('mouseover', () => showHide('s'));
		hoverTarget.addEventListener('mouseout', () => showHide('h'));
	}

	function fontScale() { // causes layout problems in FireFox that get fixed if browser's Reload is used; same may be true of other Gecko-based browsers
		if (!s5mode) return false;
		const vScale = 22; // both yield 32 (after rounding) at 1024x768
		const hScale = 32; // perhaps should auto-calculate based on theme's declared value?

		const vSize = window.innerHeight
			|| (document.documentElement && document.documentElement.clientHeight)
			|| (document.body && document.body.clientHeight)
			|| 700; // assuming 1024x768, minus chrome and such
		const hSize = window.innerWidth
			|| (document.documentElement && document.documentElement.clientWidth)
			|| (document.body && document.body.clientWidth)
			|| 1024; // these do not account for kiosk mode or Opera Show

		const newSize = Math.min(Math.round(vSize / vScale), Math.round(hSize / hScale));
		fontSize(`${newSize}px`);
		return true;
	}

	function fontSize(value) {
		let s5ss = document.getElementById('s5ss');
		if (!s5ss) {
			s5ss = document.createElement('style');
			s5ss.setAttribute('media', 'screen, projection');
			s5ss.setAttribute('id', 's5ss');
			document.getElementsByTagName('head')[0].appendChild(s5ss);
		}
		s5ss.textContent = `body {font-size: ${value} !important;}`;
	}

	function initSlideStyles() {
		const slidesLink = document.getElementById('slideProj');
		const outline = document.getElementById('outlineStyle');
		if (!slidesLink || !outline) return;
		slidesLink.setAttribute('media', 'screen');
		outline.disabled = true;
	}

	function getIncrementals(obj) {
		const list = [];
		if (!obj) return list;
		const children = Array.from(obj.children);
		for (let i = 0; i < children.length; i++) {
			const child = children[i];
			if (child.classList.contains('incremental')) {
				if (child.tagName === 'OL' || child.tagName === 'UL') {
					child.classList.remove('incremental');
					const liChildren = Array.from(child.children);
					for (let j = 0; j < liChildren.length; j++) {
						liChildren[j].classList.add('incremental');
					}
				} else {
					list.push(child);
					child.classList.remove('incremental');
				}
			}
			if (child.classList.contains('show-first')) {
				if (child.tagName === 'OL' || child.tagName === 'UL') {
					child.classList.remove('show-first');
					const first = child.children[0];
					if (first) first.classList.remove('incremental');
				} else {
					list.push(child);
				}
			}
			list.push(...getIncrementals(child));
		}
		return list;
	}

	function createIncrementals() {
		const list = [];
		for (let i = 0; i < smax; i++) {
			list[i] = getIncrementals(document.getElementById(`slide${i}`));
		}
		return list;
	}

	function defaultCheck() {
		const defaultViewMeta = document.querySelector('meta[name="defaultView"]');
		const controlVisMeta = document.querySelector('meta[name="controlVis"]');
		if (defaultViewMeta) defaultView = defaultViewMeta.content;
		if (controlVisMeta) controlVis = controlVisMeta.content;
	}

	function startup() {
		defaultCheck();
		createControls();
		cacheSlides();
		slideLabel();
		fixLinks();
		externalLinks();
		fontScale();
		initSlideStyles();
		incrementals = createIncrementals();
		slideJump();
		if (defaultView === 'outline') {
			toggle();
		}
		if (slides[0] && !slides[0].classList.contains('active')) {
			slides[0].classList.add('active');
		}
		currentSlide();

		document.addEventListener('keydown', keys);
		document.addEventListener('click', clicker);
		window.addEventListener('resize', () => {
			if (resizeRaf) window.cancelAnimationFrame(resizeRaf);
			resizeRaf = window.requestAnimationFrame(fontScale);
		});
	}

	window.addEventListener('load', startup);

	// Expose navigation helpers for external integrations.
	window.go = go;
	window.goTo = goTo;
	window.toggle = toggle;
})();
