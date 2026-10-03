"""
系统总入口
"""
from sample_project.services.order_service import checkout_order

def start_application():
    """主程序启动函数"""
    print("Starting E-Commerce System...")
    res = checkout_order("usr_999", "buyer@example.com", 299.0)
    print(f"Checkout completed with status: {res}")

def abandoned_backup_cron():
    """未引用的备份定时任务（孤立死函数候选）"""
    print("Running obsolete backup logic...")

if __name__ == "__main__":
    start_application()
