from selenium import webdriver
from selenium.webdriver.edge.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
import time

options = Options()
options.add_argument('--headless')
options.add_argument('--window-size=1920,1080')

driver = webdriver.Edge(options=options)
try:
    print('Navigating to app...')
    driver.get('http://127.0.0.1:5000')
    time.sleep(2)
    
    print('Logging in...')
    user_input = driver.find_element(By.ID, 'login-username')
    pass_input = driver.find_element(By.ID, 'login-password')
    user_input.send_keys('admin')
    pass_input.send_keys('admin123')
    driver.find_element(By.CSS_SELECTOR, '#login-form button').click()
    
    print('Waiting for dashboard...')
    time.sleep(2)
    
    print('Navigating to inventory...')
    driver.find_element(By.CSS_SELECTOR, 'a[href=\"/inventario\"]').click()
    time.sleep(2)
    print('Taking screenshot of inventory...')
    driver.save_screenshot(r'C:\Users\kfrias\.gemini\antigravity-ide\brain\fa776236-890a-4243-9817-25db5d33ee42\inventory.png')

    print('Opening modal...')
    driver.execute_script('document.getElementById(\"btn-new-device\").click();')
    time.sleep(1)
    driver.save_screenshot(r'C:\Users\kfrias\.gemini\antigravity-ide\brain\fa776236-890a-4243-9817-25db5d33ee42\modal.png')
    print('Screenshots saved.')
finally:
    driver.quit()
