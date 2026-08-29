#!/usr/bin/env python3
"""Build the PTA CD User Manual PDF with screenshots."""

import os
from fpdf import FPDF

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.join(SCRIPT_DIR, "..")
SHOTS_DIR = os.path.join(PROJECT_DIR, "screenshots")
OUTPUT = os.path.join(PROJECT_DIR, "PTA_CD_User_Manual.pdf")


class ManualPDF(FPDF):
    def header(self):
        if self.page_no() > 1:
            self.set_font("Helvetica", "I", 8)
            self.set_text_color(120, 120, 120)
            self.cell(0, 6, "PTA CD - User Manual", align="L")
            self.cell(0, 6, f"Page {self.page_no()}", align="R")
            self.ln(10)

    def footer(self):
        self.set_y(-15)
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(150, 150, 150)
        self.cell(0, 10, "PTA Collection & Disbursement System", align="C")

    def chapter_title(self, title, level=1):
        if level == 1:
            self.set_font("Helvetica", "B", 20)
            self.set_text_color(30, 60, 120)
            self.ln(8)
            self.cell(0, 12, title)
            self.ln(10)
            # Underline
            self.set_draw_color(30, 60, 120)
            self.set_line_width(0.8)
            self.line(10, self.get_y(), 200, self.get_y())
            self.ln(6)
        elif level == 2:
            self.set_font("Helvetica", "B", 14)
            self.set_text_color(40, 80, 140)
            self.ln(5)
            self.cell(0, 10, title)
            self.ln(10)
        elif level == 3:
            self.set_font("Helvetica", "B", 12)
            self.set_text_color(60, 60, 60)
            self.ln(3)
            self.cell(0, 8, title)
            self.ln(8)

    def body_text(self, text):
        self.set_font("Helvetica", "", 10)
        self.set_text_color(40, 40, 40)
        self.multi_cell(0, 5.5, text)
        self.ln(2)

    def bullet(self, text, indent=10):
        self.set_font("Helvetica", "", 10)
        self.set_text_color(40, 40, 40)
        x = self.get_x()
        self.cell(indent, 5.5, "")
        self.set_font("ZapfDingbats", "", 6)
        self.cell(5, 5.5, "l")  # bullet
        self.set_font("Helvetica", "", 10)
        self.multi_cell(0, 5.5, text)
        self.ln(1)

    def numbered_step(self, num, text):
        self.set_font("Helvetica", "B", 10)
        self.set_text_color(30, 60, 120)
        self.cell(8, 6, f"{num}.")
        self.set_font("Helvetica", "", 10)
        self.set_text_color(40, 40, 40)
        self.multi_cell(0, 6, text)
        self.ln(1)

    def tip_box(self, text):
        self.set_fill_color(230, 242, 255)
        self.set_draw_color(30, 60, 120)
        self.set_line_width(0.3)
        y_start = self.get_y()
        self.set_font("Helvetica", "BI", 10)
        self.set_text_color(30, 60, 120)
        self.cell(0, 7, "  TIP:", fill=True)
        self.ln(7)
        self.set_font("Helvetica", "I", 9)
        self.set_text_color(50, 50, 80)
        self.set_x(15)
        self.multi_cell(180, 5, text, fill=True)
        self.ln(3)

    def warning_box(self, text):
        self.set_fill_color(255, 240, 230)
        self.set_draw_color(200, 100, 30)
        self.set_line_width(0.3)
        self.set_font("Helvetica", "B", 10)
        self.set_text_color(180, 80, 20)
        self.cell(0, 7, "  NOTE:", fill=True)
        self.ln(7)
        self.set_font("Helvetica", "", 9)
        self.set_text_color(120, 60, 20)
        self.set_x(15)
        self.multi_cell(180, 5, text, fill=True)
        self.ln(3)

    def add_screenshot(self, filename, caption="", max_w=170):
        path = os.path.join(SHOTS_DIR, filename)
        if not os.path.exists(path):
            self.body_text(f"[Screenshot not found: {filename}]")
            return

        # Check remaining space
        if self.get_y() > 180:
            self.add_page()

        # Center the image
        img_w = max_w
        self.image(path, x=(210 - img_w) / 2, w=img_w)
        self.ln(2)

        if caption:
            self.set_font("Helvetica", "I", 9)
            self.set_text_color(100, 100, 100)
            self.cell(0, 5, caption, align="C")
            self.ln(8)

    def add_screenshot_full(self, filename, caption=""):
        if self.get_y() > 50:
            self.add_page()
        self.add_screenshot(filename, caption, max_w=190)


def build():
    pdf = ManualPDF()
    pdf.set_auto_page_break(auto=True, margin=20)

    # ── Cover Page ────────────────────────────────────────────────────────
    pdf.add_page()
    pdf.ln(40)
    pdf.set_font("Helvetica", "B", 36)
    pdf.set_text_color(30, 60, 120)
    pdf.cell(0, 15, "PTA CD", align="C")
    pdf.ln(18)
    pdf.set_font("Helvetica", "", 18)
    pdf.set_text_color(80, 80, 80)
    pdf.cell(0, 10, "Collection & Disbursement", align="C")
    pdf.ln(12)
    pdf.set_font("Helvetica", "", 14)
    pdf.cell(0, 10, "User Manual", align="C")
    pdf.ln(20)
    pdf.set_draw_color(30, 60, 120)
    pdf.set_line_width(1)
    pdf.line(60, pdf.get_y(), 150, pdf.get_y())
    pdf.ln(15)
    pdf.set_font("Helvetica", "", 11)
    pdf.set_text_color(100, 100, 100)
    pdf.cell(0, 8, "Parent-Teacher Association Fund Management System", align="C")
    pdf.ln(8)
    pdf.cell(0, 8, "for Schools using the TapIn School Database", align="C")
    pdf.ln(20)
    pdf.set_font("Helvetica", "I", 10)
    pdf.cell(0, 8, "Version 0.1.4", align="C")
    pdf.ln(8)
    pdf.cell(0, 8, "August 2026", align="C")

    # ── Table of Contents ─────────────────────────────────────────────────
    pdf.add_page()
    pdf.chapter_title("Table of Contents")
    toc = [
        ("1. Introduction & Overview", 3),
        ("2. Getting Started", 3),
        ("   2.1 License Activation", 3),
        ("   2.2 Login", 4),
        ("   2.3 Understanding the Layout", 4),
        ("3. Dashboard", 5),
        ("4. Recording Collections", 6),
        ("   4.1 Recording a Payment (Auto Mode)", 6),
        ("   4.2 Manual Payment Distribution", 7),
        ("   4.3 Viewing & Printing Receipts", 8),
        ("   4.4 Voiding a Collection", 8),
        ("5. Families & Balances", 9),
        ("   5.1 Searching Families", 9),
        ("   5.2 Viewing Family Details", 9),
        ("   5.3 Statement of Account", 10),
        ("6. Disbursements", 11),
        ("   6.1 Creating a Disbursement", 11),
        ("   6.2 Approving (President)", 11),
        ("   6.3 Marking as Paid (Treasurer)", 12),
        ("   6.4 Disbursement Vouchers", 12),
        ("7. Advances & Liquidation", 13),
        ("   7.1 Issuing an Advance", 13),
        ("   7.2 Adding Liquidation Items", 13),
        ("   7.3 Closing an Advance", 14),
        ("8. Funds & Distribution Rules", 15),
        ("   8.1 Managing Funds", 15),
        ("   8.2 Setting Distribution Percentages", 15),
        ("9. Financial Reports", 16),
        ("   9.1 Fund Balances", 16),
        ("   9.2 Collections Report", 16),
        ("   9.3 Parent Balances", 17),
        ("   9.4 Per-Section Collection Efficiency", 17),
        ("10. Settings", 18),
        ("   10.1 My Account", 18),
        ("   10.2 School Year", 18),
        ("   10.3 Fee Components", 19),
        ("   10.4 Officer Accounts", 19),
        ("   10.5 Receipt Numbering & Print Header", 20),
        ("   10.6 App Updates", 20),
        ("11. Role-Based Permissions", 21),
        ("12. Quick Reference", 22),
    ]
    pdf.set_font("Helvetica", "", 11)
    for item, _ in toc:
        pdf.set_text_color(40, 40, 40)
        pdf.cell(0, 7, item)
        pdf.ln(7)

    # ══════════════════════════════════════════════════════════════════════
    # CHAPTER 1 - Introduction
    # ══════════════════════════════════════════════════════════════════════
    pdf.add_page()
    pdf.chapter_title("1. Introduction & Overview")
    pdf.body_text(
        "PTA CD (Collection & Disbursement) is a desktop application designed for "
        "Parent-Teacher Associations to manage school funds. It reads the student roster "
        "from the shared TapIn School MySQL database and adds its own collection, "
        "disbursement, and fund management features."
    )
    pdf.body_text(
        "This manual covers every screen and feature of the application, from initial "
        "setup through daily use by PTA officers."
    )

    pdf.chapter_title("Key Features", level=2)
    pdf.bullet("Record PTA fee collections with auto-numbered Official Receipts (OR)")
    pdf.bullet("Manage family accounts with per-family and per-child billing")
    pdf.bullet("Auto-distribute collections into configurable PTA funds")
    pdf.bullet("Two-step disbursement workflow: President approves, Treasurer pays")
    pdf.bullet("Track cash advances with liquidation and receipt attachments")
    pdf.bullet("Generate financial reports: fund balances, collections, parent balances")
    pdf.bullet("Print Statements of Account for individual families")
    pdf.bullet("Role-based access for PTA officers (Admin, President, Treasurer, Secretary, Auditor)")

    pdf.chapter_title("System Requirements", level=2)
    pdf.bullet("Windows 10 or later")
    pdf.bullet("MySQL database server (shared with TapIn School)")
    pdf.bullet("Network connection to the database server")

    # ══════════════════════════════════════════════════════════════════════
    # CHAPTER 2 - Getting Started
    # ══════════════════════════════════════════════════════════════════════
    pdf.add_page()
    pdf.chapter_title("2. Getting Started")

    pdf.chapter_title("2.1 License Activation", level=2)
    pdf.body_text(
        "On first launch, the app will display the Activation screen. You must enter a valid "
        "license key to unlock the application. License keys are issued by your PTA administrator "
        "and are tied to a specific machine."
    )
    pdf.numbered_step(1, "The activation screen shows your Machine ID at the bottom.")
    pdf.numbered_step(2, "Send this Machine ID to your PTA administrator to receive a license key.")
    pdf.numbered_step(3, "Enter the license key in the format: DTR-XXXX-XXXX-XXXX-XXXX")
    pdf.numbered_step(4, "Click 'Activate' to unlock the app.")
    pdf.warning_box(
        "The app remains locked until a valid license key is entered. "
        "Contact your administrator if your key is rejected."
    )

    pdf.chapter_title("2.2 Login", level=2)
    pdf.add_screenshot("01-login-screen.png", "Figure 1: The Login screen")
    pdf.body_text(
        "After activation, you will see the Login screen. Enter your username and password "
        "provided by your PTA administrator. Each officer has their own account with a specific "
        "role that determines what they can do in the app."
    )
    pdf.numbered_step(1, "Enter your username in the 'Username' field.")
    pdf.numbered_step(2, "Enter your password in the 'Password' field.")
    pdf.numbered_step(3, "Click 'Sign in' to enter the application.")
    pdf.tip_box(
        "Demo accounts for testing: admin/admin, president/president, treasurer/treasurer"
    )

    pdf.chapter_title("2.3 Understanding the Layout", level=2)
    pdf.body_text(
        "The app has a consistent layout across all screens:"
    )
    pdf.bullet("Title Bar (top): Shows the app name, school year selector, and database connection status. "
               "Click the database indicator to change the server connection.")
    pdf.bullet("Sidebar (left): Navigation menu with icons for each module. Click any item to switch screens.")
    pdf.bullet("Main Area (center): The active screen content changes based on your sidebar selection.")
    pdf.bullet("User Info (bottom of sidebar): Shows your name, role, and a Logout button.")

    # ══════════════════════════════════════════════════════════════════════
    # CHAPTER 3 - Dashboard
    # ══════════════════════════════════════════════════════════════════════
    pdf.add_page()
    pdf.chapter_title("3. Dashboard")
    pdf.add_screenshot("02-dashboard.png", "Figure 2: The Dashboard overview")
    pdf.body_text(
        "The Dashboard is your home screen after logging in. It gives you a quick overview of "
        "the PTA's financial status at a glance."
    )

    pdf.chapter_title("What You See", level=2)
    pdf.bullet("Collected Today: Total collections recorded today and the number of receipts issued.")
    pdf.bullet("Pending Approvals: Number of disbursements waiting for President approval or Treasurer payment.")
    pdf.bullet("Top Outstanding: Total unpaid balances from families with the highest debts.")
    pdf.bullet("Fund Balances Table: Shows each fund's collected amount, disbursed amount, "
               "advances outstanding, and current balance.")
    pdf.bullet("Highest Outstanding Balances: The top families with unpaid balances, showing "
               "how many children they have and their total debt.")

    pdf.chapter_title("Quick Actions", level=2)
    pdf.body_text(
        "At the bottom of the Dashboard, you'll find quick-access buttons:"
    )
    pdf.bullet("'Record collection' - Jump directly to the Collections screen to record a new payment.")
    pdf.bullet("'New disbursement' - Jump to Disbursements to create a new payment request.")
    pdf.bullet("'Financial reports' - Jump to the Reports screen to view financial summaries.")

    # ══════════════════════════════════════════════════════════════════════
    # CHAPTER 4 - Collections
    # ══════════════════════════════════════════════════════════════════════
    pdf.add_page()
    pdf.chapter_title("4. Recording Collections")
    pdf.add_screenshot("03-collections.png", "Figure 3: The Collections screen")
    pdf.body_text(
        "The Collections screen is where you record PTA fee payments from parents/guardians. "
        "Each payment automatically generates an Official Receipt (OR) with a unique number."
    )

    pdf.chapter_title("4.1 Recording a Payment (Auto Mode)", level=2)
    pdf.body_text(
        "Auto mode uses FIFO (First In, First Out) to apply payments to the oldest unpaid charges first."
    )
    pdf.numbered_step(1, "Search for the family: Type the guardian's name or address in the 'Family' search box. "
                     "Select the correct family from the dropdown.")
    pdf.numbered_step(2, "View the outstanding balance: The app shows the family's total outstanding balance, "
                     "broken down by current year and prior years.")
    pdf.numbered_step(3, "Enter the payment amount: Type the amount in the 'Amount' field. "
                     "You can pay any amount up to the outstanding balance.")
    pdf.numbered_step(4, "Select a specific child (optional): If the parent is paying for a specific child, "
                     "select that child from the dropdown. Otherwise, leave it on 'All children (auto-apply)'.")
    pdf.numbered_step(5, "Choose the school year: If the family has prior-year balances, you can choose "
                     "which year to settle. Use 'All years' to settle everything oldest-first.")
    pdf.numbered_step(6, "Set the date and notes (optional): The date defaults to today. "
                     "Add any notes like 'Cash - first payment'.")
    pdf.numbered_step(7, "Click 'Record & issue OR' to save the payment and generate the receipt.")
    pdf.tip_box(
        "Click 'Use full balance' to automatically fill in the full outstanding amount "
        "and select 'All years' for quick settlement."
    )

    pdf.chapter_title("4.2 Manual Payment Distribution", level=2)
    pdf.body_text(
        "Manual mode lets you choose exactly which charges to pay and how much for each. "
        "This is useful when a parent wants to pay for a specific fee only."
    )
    pdf.numbered_step(1, "Select the family and enter the payment amount first.")
    pdf.numbered_step(2, "Click the 'Manual' button in the Distribution section.")
    pdf.numbered_step(3, "A modal window opens showing all unpaid charges for the family.")
    pdf.numbered_step(4, "Enter the amount to allocate for each charge. Use the 'Full' button "
                     "to allocate the full balance of a charge, or 'Clear' to remove an allocation.")
    pdf.numbered_step(5, "The footer shows Payment total, Allocated total, and Remaining amount. "
                     "The total must match exactly.")
    pdf.numbered_step(6, "Click 'Auto-fill remaining' to distribute any remaining amount across charges.")
    pdf.numbered_step(7, "Click 'Confirm allocation' when the amounts match.")
    pdf.warning_box(
        "The total of all allocations must exactly equal the payment amount. "
        "You cannot confirm until they match."
    )

    pdf.add_page()
    pdf.chapter_title("4.3 Viewing & Printing Receipts", level=2)
    pdf.body_text(
        "After recording a payment, the receipt details modal opens automatically. "
        "You can also view any receipt from the collections list."
    )
    pdf.numbered_step(1, "Click the eye icon next to any collection in the list.")
    pdf.numbered_step(2, "The receipt shows: OR number, family name, amount, balance after payment, "
                     "date, and collector name.")
    pdf.numbered_step(3, "The 'Applied to charges' table shows which specific charges were settled.")
    pdf.numbered_step(4, "The 'Fund distribution' table shows how the payment was split across funds.")
    pdf.numbered_step(5, "Click 'Print receipt' to print a physical copy for the parent.")

    pdf.chapter_title("4.4 Voiding a Collection", level=2)
    pdf.body_text(
        "If a collection was recorded in error, you can void it to reverse the payment."
    )
    pdf.numbered_step(1, "Click the trash icon next to the collection you want to void.")
    pdf.numbered_step(2, "A confirmation dialog appears showing the receipt details.")
    pdf.numbered_step(3, "Click 'Void receipt' to confirm. The payment is reversed on the "
                     "family's balance and the OR number is kept for the record.")
    pdf.warning_box(
        "Voiding a collection is permanent. The OR number is retained for audit purposes "
        "but the family's balance is restored."
    )

    # ══════════════════════════════════════════════════════════════════════
    # CHAPTER 5 - Families
    # ══════════════════════════════════════════════════════════════════════
    pdf.add_page()
    pdf.chapter_title("5. Families & Balances")
    pdf.add_screenshot("04-families.png", "Figure 4: The Families & Balances screen")
    pdf.body_text(
        "The Families screen shows all PTA families derived from the TapIn School student roster. "
        "Each family is identified by the guardian name and address."
    )

    pdf.chapter_title("5.1 Searching Families", level=2)
    pdf.body_text(
        "Use the search bar to filter families by guardian name, address, or child name. "
        "The search is case-insensitive and updates as you type."
    )
    pdf.bullet("Click 'Re-sync roster' to refresh families from the TapIn School database. "
               "Use this when new students have been added or guardians updated.")

    pdf.chapter_title("5.2 Viewing Family Details", level=2)
    pdf.numbered_step(1, "Click the eye icon next to any family to open the detail modal.")
    pdf.numbered_step(2, "The detail shows: address, contact number, total charges, total paid, and balance.")
    pdf.numbered_step(3, "The 'Children' table lists all students in the family with their section and status.")
    pdf.numbered_step(4, "Click 'Statement of account' to view the full transaction history.")

    pdf.chapter_title("5.3 Statement of Account", level=2)
    pdf.body_text(
        "The Statement of Account is a printable financial statement for a specific family. "
        "It shows all charges and payments with a running balance."
    )
    pdf.numbered_step(1, "Click the 'Statement' button next to any family in the list.")
    pdf.numbered_step(2, "The statement shows all charges (debits) and payments (credits) "
                     "with a running balance column.")
    pdf.numbered_step(3, "The footer shows total charges, total paid, and the remaining balance.")
    pdf.numbered_step(4, "If the family has prior-year balances, a 'Balance forward' line appears.")
    pdf.numbered_step(5, "Click 'Print statement' to generate a printable PDF for the parent.")

    pdf.chapter_title("5.4 Paying from the Families Screen", level=2)
    pdf.body_text(
        "You can also record a payment directly from the Families screen:"
    )
    pdf.numbered_step(1, "Click on the red balance amount of any family with outstanding balance.")
    pdf.numbered_step(2, "A modal opens showing unpaid charges broken down by school year.")
    pdf.numbered_step(3, "Select the school year, enter the amount, and click 'Record & issue OR'.")

    # ══════════════════════════════════════════════════════════════════════
    # CHAPTER 6 - Disbursements
    # ══════════════════════════════════════════════════════════════════════
    pdf.add_page()
    pdf.chapter_title("6. Disbursements")
    pdf.add_screenshot("05-disbursements.png", "Figure 5: The Disbursements screen")
    pdf.body_text(
        "Disbursements are payments made by the PTA from its funds. The app follows the standard "
        "DepEd PTA practice: a two-step approval workflow with auto-numbered Disbursement Vouchers (DV)."
    )
    pdf.body_text(
        "Workflow: DRAFT -> APPROVED (President) -> PAID (Treasurer)"
    )

    pdf.chapter_title("6.1 Creating a Disbursement", level=2)
    pdf.body_text("Only the Treasurer (or Admin) can create new disbursements.")
    pdf.numbered_step(1, "Click '+ New disbursement' in the top-right corner.")
    pdf.numbered_step(2, "Fill in the form: Fund (select from dropdown), Payee name, Purpose of payment, "
                     "Amount, and Date.")
    pdf.numbered_step(3, "Add any notes (optional).")
    pdf.numbered_step(4, "Click 'Create disbursement'. The system assigns a DV number automatically.")
    pdf.tip_box(
        "Use the toolbar filters to view disbursements by status (Draft, Approved, Paid) "
        "and date range."
    )

    pdf.chapter_title("6.2 Approving a Disbursement (President)", level=2)
    pdf.body_text("The President (or Admin) reviews and approves draft disbursements.")
    pdf.numbered_step(1, "Filter the list by 'Draft' status to see pending approvals.")
    pdf.numbered_step(2, "Review the payee, purpose, and amount of each draft.")
    pdf.numbered_step(3, "Click 'Approve' on the disbursement. The status changes to 'APPROVED'.")

    pdf.chapter_title("6.3 Marking as Paid (Treasurer)", level=2)
    pdf.body_text("The Treasurer marks approved disbursements as paid after the check is issued.")
    pdf.numbered_step(1, "Filter by 'Approved' status to see disbursements ready for payment.")
    pdf.numbered_step(2, "Click 'Mark paid' on the disbursement.")
    pdf.numbered_step(3, "Enter the check/OR reference number and the name of the person who received payment.")
    pdf.numbered_step(4, "Click 'Confirm payment'. The status changes to 'PAID'.")

    pdf.add_page()
    pdf.chapter_title("6.4 Disbursement Vouchers", level=2)
    pdf.body_text(
        "Every disbursement gets an auto-numbered Disbursement Voucher (DV). The DV number format "
        "is configurable in Settings (default: DV-YYYY-NNNN)."
    )
    pdf.numbered_step(1, "Click the printer icon on any disbursement to view the voucher.")
    pdf.numbered_step(2, "The voucher shows all payment details including signatories.")
    pdf.numbered_step(3, "Click 'Print voucher' to print a physical copy.")

    pdf.chapter_title("6.5 Attachments", level=2)
    pdf.body_text(
        "You can attach supporting documents (receipts, quotes, etc.) to any disbursement."
    )
    pdf.numbered_step(1, "Click the paperclip icon on any disbursement row.")
    pdf.numbered_step(2, "Click 'Attach file' and select the document from your computer.")
    pdf.numbered_step(3, "The attachment appears in the list. Click to open, or click the X to remove.")

    # ══════════════════════════════════════════════════════════════════════
    # CHAPTER 7 - Advances & Liquidation
    # ══════════════════════════════════════════════════════════════════════
    pdf.add_page()
    pdf.chapter_title("7. Advances & Liquidation")
    pdf.add_screenshot("06-advances.png", "Figure 6: The Advances & Liquidation screen")
    pdf.body_text(
        "Cash advances are funds issued from a PTA fund to an officer for a specific purpose "
        "(e.g., School Fair, supplies). The officer must later liquidate the advance by submitting "
        "expense items with receipts."
    )

    pdf.chapter_title("7.1 Issuing an Advance", level=2)
    pdf.body_text("Only the Treasurer (or Admin) can issue advances.")
    pdf.numbered_step(1, "Click '+ Issue advance' in the top-right corner.")
    pdf.numbered_step(2, "Select the fund to draw from (e.g., General Fund).")
    pdf.numbered_step(3, "Enter the recipient's name (the officer receiving the cash).")
    pdf.numbered_step(4, "Enter the purpose (e.g., 'School Fair - food stalls').")
    pdf.numbered_step(5, "Enter the amount and date issued.")
    pdf.numbered_step(6, "Click 'Issue advance'. The status starts as 'ISSUED'.")

    pdf.chapter_title("7.2 Adding Liquidation Items", level=2)
    pdf.body_text(
        "After spending the advance, the officer reports expenses with receipts."
    )
    pdf.numbered_step(1, "Click the receipt icon on the advance row to open the liquidation modal.")
    pdf.numbered_step(2, "The modal shows: advance amount, liquidated total, and remaining balance.")
    pdf.numbered_step(3, "For each expense: enter the date, description, and amount.")
    pdf.numbered_step(4, "Click 'Attach receipt' to add a scanned/photographed receipt image or PDF.")
    pdf.numbered_step(5, "Click '+ Add expense item' to save each line item.")
    pdf.numbered_step(6, "Repeat for all expenses. The items list grows as you add them.")
    pdf.tip_box(
        "If total expenses are less than the advance, the difference is returned to the fund. "
        "If expenses exceed the advance, an additional release is charged to the fund."
    )

    pdf.chapter_title("7.3 Closing an Advance", level=2)
    pdf.body_text("The Treasurer closes the advance after all items are recorded.")
    pdf.numbered_step(1, "Review all liquidation items and verify the totals.")
    pdf.numbered_step(2, "Click 'Close & return balance' (if expenses < advance) or "
                     "'Close liquidation' (if expenses >= advance).")
    pdf.numbered_step(3, "The status changes to 'RETURNED' or 'LIQUIDATED' accordingly.")
    pdf.warning_box(
        "Once closed, no more items can be added to the advance. "
        "Make sure all expenses are recorded before closing."
    )

    # ══════════════════════════════════════════════════════════════════════
    # CHAPTER 8 - Funds & Distribution Rules
    # ══════════════════════════════════════════════════════════════════════
    pdf.add_page()
    pdf.chapter_title("8. Funds & Distribution Rules")
    pdf.add_screenshot("07-funds.png", "Figure 7: The Funds & Distribution screen")
    pdf.body_text(
        "This screen manages your chart of accounts (funds) and defines how collection "
        "payments are automatically distributed across funds."
    )

    pdf.chapter_title("8.1 Managing Funds", level=2)
    pdf.body_text(
        "Funds represent the different accounts where PTA money is held. "
        "The default fund is 'General Fund'. You can add more funds as needed."
    )
    pdf.numbered_step(1, "Click '+ Add fund' to create a new fund.")
    pdf.numbered_step(2, "Enter the fund name (e.g., 'Classroom Fund', 'Special Project Fund').")
    pdf.numbered_step(3, "Optionally add a description.")
    pdf.numbered_step(4, "Click 'Add fund' to save.")
    pdf.warning_box(
        "Funds that have distribution rules, disbursements, or advances attached "
        "cannot be deleted."
    )

    pdf.chapter_title("8.2 Setting Distribution Percentages", level=2)
    pdf.body_text(
        "For each fee component, you define what percentage of every collection goes to each fund. "
        "The percentages for each component must total 100%."
    )
    pdf.body_text(
        "Example: If Membership (200) has 70% General Fund and 30% Classroom Fund, "
        "then every 200 collected in membership fees splits as 140 to General and 60 to Classroom."
    )
    pdf.numbered_step(1, "In the Distribution Rules table, find the fee component row.")
    pdf.numbered_step(2, "For each fund column, enter the percentage (0-100).")
    pdf.numbered_step(3, "The percentages across all funds for one component must total 100%.")
    pdf.numbered_step(4, "Changes take effect immediately for future collections.")
    pdf.tip_box(
        "The distribution is applied at the charge level, so you can see exactly how much "
        "of each collection went to which fund in the receipt detail."
    )

    # ══════════════════════════════════════════════════════════════════════
    # CHAPTER 9 - Reports
    # ══════════════════════════════════════════════════════════════════════
    pdf.add_page()
    pdf.chapter_title("9. Financial Reports")
    pdf.add_screenshot("08-reports.png", "Figure 8: The Financial Reports screen")
    pdf.body_text(
        "The Reports screen provides four types of financial reports. Use the tabs at the top "
        "to switch between report types."
    )

    pdf.chapter_title("9.1 Fund Balances", level=2)
    pdf.body_text(
        "Shows the financial position of each fund: total collected, total disbursed, "
        "advances outstanding, and current balance."
    )
    pdf.bullet("Use this report to monitor fund health and ensure sufficient funds for planned expenses.")

    pdf.chapter_title("9.2 Collections Report", level=2)
    pdf.body_text(
        "Shows total collections grouped by fee component. You can filter by date range."
    )
    pdf.numbered_step(1, "Use the date pickers to set a 'From' and 'To' date range.")
    pdf.numbered_step(2, "The table shows each component's collected amount.")
    pdf.numbered_step(3, "The last row shows the TOTAL across all components.")

    pdf.chapter_title("9.3 Parent Balances", level=2)
    pdf.body_text(
        "Shows all families with their total charges, total paid, and remaining balance. "
        "Includes a search filter."
    )
    pdf.numbered_step(1, "Use the search box to filter by family name.")
    pdf.numbered_step(2, "The last row shows the TOTAL across all families.")
    pdf.body_text(
        "Use this report to identify families with outstanding balances and plan collection drives."
    )

    pdf.chapter_title("9.4 Per-Section Collection Efficiency", level=2)
    pdf.body_text(
        "Shows collection totals broken down by grade section, including student count, "
        "total charges, total paid, and balance."
    )
    pdf.numbered_step(1, "Click on any section row to drill down into individual guardians.")
    pdf.numbered_step(2, "The drill-down shows each guardian's children, charges, payments, and balance.")
    pdf.tip_box(
        "Use this report to identify which sections have the highest collection rates "
        "and which need follow-up."
    )

    pdf.chapter_title("Printing Reports", level=2)
    pdf.body_text(
        "Click 'Print current report' at the bottom of the screen to print or save the report "
        "as a PDF using your browser's print dialog."
    )

    # ══════════════════════════════════════════════════════════════════════
    # CHAPTER 10 - Settings
    # ══════════════════════════════════════════════════════════════════════
    pdf.add_page()
    pdf.chapter_title("10. Settings")
    pdf.add_screenshot("09-settings.png", "Figure 9: The Settings screen")
    pdf.body_text(
        "The Settings screen lets you configure all aspects of the PTA CD application. "
        "Most settings take effect immediately."
    )

    pdf.chapter_title("10.1 My Account", level=2)
    pdf.body_text(
        "View and manage your personal account information."
    )
    pdf.bullet("Upload a profile photo by clicking 'Upload photo'.")
    pdf.bullet("Change your password by clicking 'Change password'.")
    pdf.bullet("Your current role is displayed and cannot be changed by yourself.")

    pdf.chapter_title("10.2 School Year", level=2)
    pdf.body_text(
        "Select the active school year. All charges and collections are scoped to this year."
    )
    pdf.numbered_step(1, "Select the school year from the dropdown.")
    pdf.numbered_step(2, "Charges are automatically recomputed when you change the year.")
    pdf.warning_box(
        "Changing the school year recomputes all charges. Make sure all collections "
        "for the previous year are complete before switching."
    )

    pdf.chapter_title("10.3 Fee Components", level=2)
    pdf.body_text(
        "Fee components define the charges applied to each family. By default, only "
        "Membership (200 per family) is configured."
    )
    pdf.numbered_step(1, "Click '+ Add component' to create a new fee type.")
    pdf.numbered_step(2, "Enter the code (e.g., 'MISC'), label (e.g., 'Miscellaneous'), and amount.")
    pdf.numbered_step(3, "Choose billing type: 'Per family' (billed once) or 'Per child' (billed for each student).")
    pdf.numbered_step(4, "Optionally set a term (e.g., '1st', '2nd') for quarterly fees.")
    pdf.numbered_step(5, "Click 'Save' to add the component.")
    pdf.body_text(
        "Example: A school year fee of 650 per child can be broken down as:\n"
        "  - Membership: 200 (per family)\n"
        "  - Miscellaneous: 200 (per child)\n"
        "  - Other Collectibles: 250 (per child)\n"
        "For a family with 3 children: 200 + 3x(200+250) = 1,550"
    )

    pdf.chapter_title("10.4 Officer Accounts", level=2)
    pdf.body_text(
        "Manage PTA officer accounts and their roles. Roles determine what each officer can do."
    )
    pdf.numbered_step(1, "Click '+ Add officer' to create a new account.")
    pdf.numbered_step(2, "Enter the full name, username, role, and password (min 4 characters).")
    pdf.numbered_step(3, "Optionally upload a profile photo.")
    pdf.numbered_step(4, "Click 'Add officer' to save.")
    pdf.body_text(
        "To edit an existing account, click the pencil icon. To change a password, "
        "you must enter the officer's current password first."
    )

    pdf.add_page()
    pdf.chapter_title("10.5 Receipt Numbering & Print Header", level=2)
    pdf.body_text(
        "Configure the auto-numbering format for Official Receipts and Disbursement Vouchers."
    )
    pdf.bullet("OR prefix: Default is 'OR-'. Numbers follow the format PREFIX-YEAR-NNNN (e.g., OR-2026-0001).")
    pdf.bullet("DV prefix: Default is 'DV-'. Same numbering format as OR.")
    pdf.bullet("Print header: Custom letterhead text shown on printed statements and receipts. "
               "Leave empty to use the school name from the database.")

    pdf.chapter_title("10.6 App Updates", level=2)
    pdf.body_text(
        "The app can check for and install updates automatically."
    )
    pdf.numbered_step(1, "Click 'Check for updates' to see if a new version is available.")
    pdf.numbered_step(2, "If available, click 'Download update' to download it.")
    pdf.numbered_step(3, "After download, click 'Restart & install' to apply the update.")
    pdf.tip_box(
        "If the app's GitHub repository is private, you'll need to provide a GitHub token "
        "in the 'GitHub token' section under Updates."
    )

    # ══════════════════════════════════════════════════════════════════════
    # CHAPTER 11 - Role-Based Permissions
    # ══════════════════════════════════════════════════════════════════════
    pdf.add_page()
    pdf.chapter_title("11. Role-Based Permissions")
    pdf.body_text(
        "The app uses role-based access control matching standard DepEd PTA practices. "
        "Each officer's role determines what actions they can perform."
    )

    # Permission table
    pdf.set_font("Helvetica", "B", 10)
    pdf.set_fill_color(30, 60, 120)
    pdf.set_text_color(255, 255, 255)
    col_w = [40, 22, 22, 22, 22, 22, 22]
    headers = ["Action", "Admin", "President", "Vice Pres.", "Treasurer", "Secretary", "Auditor"]
    for i, h in enumerate(headers):
        pdf.cell(col_w[i], 8, h, border=1, fill=True, align="C")
    pdf.ln()

    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(40, 40, 40)
    rows = [
        ["Record collections", "Y", "Y", "Y", "Y", "Y", "N"],
        ["View reports", "Y", "Y", "Y", "Y", "Y", "Y"],
        ["View all data", "Y", "Y", "Y", "Y", "Y", "Y"],
        ["Create disbursements", "Y", "N", "N", "Y", "Y", "N"],
        ["Approve disbursements", "Y", "Y", "N", "N", "N", "N"],
        ["Mark disbursements paid", "Y", "N", "N", "Y", "N", "N"],
        ["Issue advances", "Y", "N", "N", "Y", "N", "N"],
        ["Close advances", "Y", "N", "N", "Y", "N", "N"],
        ["Manage officers", "Y", "N", "N", "N", "N", "N"],
        ["Manage settings", "Y", "N", "N", "N", "N", "N"],
        ["Manage funds", "Y", "N", "N", "N", "N", "N"],
    ]
    for row in rows:
        fill = False
        for i, cell in enumerate(row):
            align = "L" if i == 0 else "C"
            pdf.cell(col_w[i], 7, cell, border=1, align=align)
        pdf.ln()

    pdf.ln(5)
    pdf.body_text(
        "Note: The Admin role has full access to all features. Other roles are limited "
        "as shown above. The app always enforces these permissions."
    )

    # ══════════════════════════════════════════════════════════════════════
    # CHAPTER 12 - Quick Reference
    # ══════════════════════════════════════════════════════════════════════
    pdf.add_page()
    pdf.chapter_title("12. Quick Reference")

    pdf.chapter_title("Keyboard Shortcuts", level=2)
    pdf.bullet("Tab: Move between form fields")
    pdf.bullet("Enter: Submit forms or confirm actions")
    pdf.bullet("Escape: Close modals and dialogs")
    pdf.bullet("Arrow keys: Navigate search dropdowns")

    pdf.chapter_title("Common Workflows", level=2)

    pdf.chapter_title("Daily Collection Workflow", level=3)
    pdf.numbered_step(1, "Log in as Treasurer or Secretary.")
    pdf.numbered_step(2, "Go to Collections.")
    pdf.numbered_step(3, "Search for the family and enter the payment amount.")
    pdf.numbered_step(4, "Click 'Record & issue OR' to generate the receipt.")
    pdf.numbered_step(5, "Print the receipt and give it to the parent.")
    pdf.numbered_step(6, "Repeat for each payment received.")

    pdf.chapter_title("Disbursement Workflow", level=3)
    pdf.numbered_step(1, "Treasurer: Go to Disbursements -> Click '+ New disbursement'.")
    pdf.numbered_step(2, "Treasurer: Fill in payee, purpose, amount, and fund. Click 'Create'.")
    pdf.numbered_step(3, "President: Filter by 'Draft'. Click 'Approve' on the disbursement.")
    pdf.numbered_step(4, "Treasurer: Filter by 'Approved'. Click 'Mark paid'. Enter reference number.")
    pdf.numbered_step(5, "Both: Print the Disbursement Voucher for the record.")

    pdf.chapter_title("End-of-Year Process", level=3)
    pdf.numbered_step(1, "Review all collections and ensure all payments are recorded.")
    pdf.numbered_step(2, "Check all disbursements are paid and closed.")
    pdf.numbered_step(3, "Close all advances with liquidation items.")
    pdf.numbered_step(4, "Go to Settings -> Change the school year to the new year.")
    pdf.numbered_step(5, "Charges are automatically recomputed for the new year.")

    pdf.chapter_title("Default Accounts", level=2)
    pdf.body_text("The following accounts are available for demonstration:")
    pdf.bullet("admin / admin - Full access (Administrator)")
    pdf.bullet("president / president - Can approve disbursements")
    pdf.bullet("treasurer / treasurer - Can record collections and mark disbursements paid")
    pdf.bullet("secretary / secretary - Can record collections and create disbursements")

    pdf.ln(10)
    pdf.set_font("Helvetica", "I", 10)
    pdf.set_text_color(100, 100, 100)
    pdf.cell(0, 8, "For technical support or questions, contact your PTA administrator.", align="C")

    # ── Save ──────────────────────────────────────────────────────────────
    pdf.output(OUTPUT)
    print(f"PDF saved to: {OUTPUT}")
    print(f"Total pages: {pdf.page_no()}")


if __name__ == "__main__":
    build()
