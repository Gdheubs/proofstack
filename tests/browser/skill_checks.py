"""Browser regression checks against a real, disposable API fixture.

Requires Next at PROOFSTACK_BROWSER_URL (default https://127.0.0.1:3100),
rewriting /api to the assessment fixture server. No API responses are mocked.
Run via the assessments browser integration harness, not against production.
"""
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get('PROOFSTACK_BROWSER_URL', 'https://127.0.0.1:3100')
ARTIFACTS = Path(os.environ.get('TEMP', '.')) / 'proofstack-browser-checks'
ARTIFACTS.mkdir(parents=True, exist_ok=True)
GROUPS = {
    'Community': [('Projects', '/projects'), ('Repositories', '/repositories'), ('Organizations', '/organizations'), ('Search community', '/search'), ('Writing assist', '/assist')],
    'Talent': [('Talent directory', '/talent'), ('Skill checks', '/assessments'), ('My profile', '/profile/me')],
    'Career workspace': [('Career preferences', '/career'), ('Applications & hiring inbox', '/career/applications'), ('Opportunities', '/opportunities'), ('Intelligence workspace', '/intelligence')],
    'Build log': [('Latest updates', '/community'), ('Bookmarks', '/bookmarks'), ('Notifications', '/notifications')],
}

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    # Only this disposable test browser accepts the local self-signed certificate.
    page = browser.new_page(viewport={'width': 1440, 'height': 1000}, ignore_https_errors=True)
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    response = page.goto(BASE, wait_until='networkidle')
    assert response.status == 200
    primary = page.get_by_role('navigation', name='Primary', exact=True)
    destination_count = 0
    # Enumerate every actual menu entry and follow it; no hidden second nav.
    for group, destinations in GROUPS.items():
        for label, path in destinations:
            primary.get_by_role('button', name=group, exact=True).click()
            menu = page.get_by_role('menu')
            expect(menu.get_by_role('menuitem')).to_have_count(len(destinations))
            link = menu.locator(f'a[href="{path}"]')
            expect(link).to_contain_text(label)
            link.click()
            page.wait_for_url(BASE + path)
            expect(primary.get_by_role('button', name=group, exact=True)).to_have_attribute('aria-current', 'true')
            assert page.locator('main nav[aria-label="Community"]').count() == 0
            assert page.get_by_text('This page could not be found', exact=False).count() == 0
            destination_count += 1
    # The preferences page must not embed the dedicated hiring inbox anymore.
    page.goto(BASE + '/career', wait_until='networkidle')
    expect(page.locator('main').get_by_role('heading', name='Applications', exact=True)).to_have_count(0)
    page.goto(BASE + '/career/applications', wait_until='networkidle')
    expect(page.get_by_role('heading', name='Applications & hiring inbox', exact=True)).to_be_visible()
    # Exercise the real settled auth UI redirect, not just the helper's allowlist.
    page.goto(BASE + '/auth?next=%2Fassessments', wait_until='networkidle')
    page.wait_for_url(BASE + '/assessments')
    page.goto(BASE + '/auth?next=https%3A%2F%2Fevil.example', wait_until='networkidle')
    page.wait_for_url(BASE + '/account')
    expect(page.get_by_role('link', name='Manage organizations', exact=True)).to_be_visible()
    expect(page.locator('main').get_by_role('button', name='Create organization', exact=True)).to_have_count(0)
    page.goto(BASE + '/notifications', wait_until='networkidle')
    for width in [320, 390, 768, 1024, 1280, 1440]:
        page.set_viewport_size({'width': width, 'height': 1000})
        assert not page.evaluate('document.documentElement.scrollWidth > innerWidth'), f'Overflow at {width}'
    # Mobile reveals only the chosen group's links, closes on navigation.
    page.set_viewport_size({'width': 390, 'height': 844})
    page.get_by_role('button', name='Open menu', exact=True).click()
    mobile = page.get_by_role('navigation', name='Mobile', exact=True)
    for group, destinations in GROUPS.items():
        mobile.get_by_role('button', name=group, exact=True).click()
        assert mobile.locator('a:visible').count() == len(destinations) + 2  # Overview + Account
        for _, path in destinations:
            expect(mobile.locator(f'a[href="{path}"]')).to_be_visible()
    page.screenshot(path=str(ARTIFACTS / 'navigation-mobile.png'), animations='disabled')
    mobile.get_by_role('button', name='Talent', exact=True).click()
    mobile.locator('a[href="/assessments"]').click()
    expect(mobile).not_to_be_visible()
    expect(page.get_by_role('heading', name='Put your foundations to the test.', exact=True)).to_be_visible()
    page.screenshot(path=str(ARTIFACTS / 'skill-checks-mobile.png'), animations='disabled', full_page=True)
    page.set_viewport_size({'width': 1440, 'height': 1000})
    expect(page.get_by_role('button', name='Start JavaScript foundations', exact=True)).to_be_visible()
    expect(page.get_by_role('button', name='Start Web accessibility', exact=True)).to_be_visible()
    with page.expect_response(lambda response: response.url.endswith('/api/assessments/start')) as start_response:
        page.get_by_role('button', name='Start JavaScript foundations', exact=True).click()
    assert start_response.value.ok, (start_response.value.status, start_response.value.text())
    page.wait_for_url(BASE + '/assessments/*')
    attempt_id = page.url.rsplit('/', 1)[1]
    attempt_response = page.request.get(BASE + '/api/assessments/attempts/' + attempt_id)
    assert attempt_response.ok
    attempt = attempt_response.json()
    expect(page.get_by_role('button', name='Submit answers', exact=True)).to_be_disabled()
    page.reload(wait_until='networkidle')
    expect(page.get_by_text('Question 1 of 5', exact=True)).to_be_visible()
    for index, question in enumerate(attempt['questions']):
        expect(page.get_by_role('group', name=question['prompt'], exact=True)).to_be_visible()
        page.get_by_role('radio').first.check()
        if index < len(attempt['questions']) - 1:
            page.get_by_role('button', name='Next question', exact=True).click()
    expect(page.get_by_role('button', name='Submit answers', exact=True)).to_be_enabled()
    page.get_by_role('button', name='Previous', exact=True).click()
    expect(page.get_by_role('radio').first).to_be_checked()
    page.get_by_role('button', name='Next question', exact=True).click()
    page.screenshot(path=str(ARTIFACTS / 'skill-question-desktop.png'), animations='disabled', full_page=True)
    page.get_by_role('button', name='Submit answers', exact=True).click()
    expect(page.get_by_role('heading', name='Check completed', exact=True)).to_be_visible()
    saved = page.request.get(BASE + '/api/assessments/attempts/' + attempt_id).json()
    assert saved['status'] == 'completed'
    result = saved['result']
    assert result['id'] == attempt_id and result['total'] == len(attempt['questions'])
    expect(page.get_by_text(str(result['score']) + '%', exact=True)).to_be_visible()
    page.reload(wait_until='networkidle')
    expect(page.get_by_role('heading', name='Check completed', exact=True)).to_be_visible()
    assert page.get_by_role('button', name='Submit answers', exact=True).count() == 0
    page.get_by_role('link', name='View results on your profile', exact=True).click()
    page.wait_for_url(BASE + '/profile/me')
    expect(page.get_by_role('heading', name='Browser skill-check tester', exact=True)).to_be_visible()
    expect(page.get_by_role('heading', name='Skill-check results', exact=True)).to_be_visible()
    expect(page.get_by_text(str(result['score']) + '%', exact=True)).to_be_visible()
    expect(page.get_by_text(result['remark'], exact=True)).to_be_visible()
    page.screenshot(path=str(ARTIFACTS / 'profile-result-desktop.png'), animations='disabled', full_page=True)
    own_results = page.request.get(BASE + '/api/assessments/results?handle=me').json()['results']
    assert any(item['id'] == attempt_id for item in own_results)
    page.set_viewport_size({'width': 390, 'height': 844})
    expect(page.get_by_role('heading', name='Browser skill-check tester', exact=True)).to_be_visible()
    expect(page.get_by_text(str(result['score']) + '%', exact=True)).to_be_visible()
    assert not page.evaluate('document.documentElement.scrollWidth > innerWidth')
    page.screenshot(path=str(ARTIFACTS / 'profile-result-mobile.png'), animations='disabled', full_page=True)
    assert not errors, errors
    report = {'navigation_destinations_checked': destination_count, 'responsive_widths_checked': 6, 'completed_attempt': attempt_id, 'server_result': result, 'browser_errors': errors, 'artifacts': str(ARTIFACTS)}
    (ARTIFACTS / 'report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(json.dumps(report))
    browser.close()
