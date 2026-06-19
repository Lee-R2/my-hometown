from playwright.sync_api import sync_playwright
import json

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()

    # Step 1: Login
    page.goto('http://localhost:5000/admin/login')
    page.wait_for_load_state('networkidle')
    page.screenshot(path='/tmp/login_page.png')

    # Fill login form
    page.fill('input[placeholder*="用户名"], input[name="username"], input[type="text"]', 'admin')
    page.fill('input[placeholder*="密码"], input[name="password"], input[type="password"]', 'admin123')

    # Click login button
    login_btn = page.locator('button[type="submit"], button:has-text("登录")')
    if login_btn.count() > 0:
        login_btn.first.click()
    else:
        # Try clicking any button
        page.locator('button').first.click()

    page.wait_for_load_state('networkidle')
    page.wait_for_timeout(2000)
    page.screenshot(path='/tmp/after_login.png')

    current_url = page.url
    print(f"After login URL: {current_url}")

    # Step 2: Navigate to blackboard page
    page.goto('http://localhost:5000/admin/blackboard')
    page.wait_for_load_state('networkidle')
    page.wait_for_timeout(3000)
    page.screenshot(path='/tmp/blackboard_page.png')

    # Get page content
    content = page.content()
    print(f"Page title: {page.title()}")
    print(f"Page URL: {page.url}")

    # Check for error messages
    error_elements = page.locator('.text-red, [class*="error"], [class*="Error"]')
    if error_elements.count() > 0:
        for i in range(error_elements.count()):
            print(f"Error text: {error_elements.nth(i).text_content()}")

    # Check for posts
    post_cards = page.locator('[class*="Card"], [class*="card"]')
    print(f"Number of card elements: {post_cards.count()}")

    # Check for stats
    stats_section = page.locator('text=总帖子数')
    if stats_section.count() > 0:
        print("Stats section found!")
        parent = stats_section.first.locator('..')
        print(f"Stats content: {parent.text_content()}")

    # Check page text for key elements
    page_text = page.inner_text('body')
    if '家乡黑板报' in page_text:
        print("✅ Page header '家乡黑板报' found")
    else:
        print("❌ Page header '家乡黑板报' NOT found")

    if '总帖子数' in page_text:
        print("✅ Stats section found")
    else:
        print("❌ Stats section NOT found")

    if '暂无帖子' in page_text or '加载中' in page_text or '测试帖子' in page_text or '环保' in page_text:
        print("✅ Post content area found")
    else:
        print("❌ Post content area NOT found")

    browser.close()
