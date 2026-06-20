"""
Generates a detailed 30-50 page architecture PDF for an
AI Staff Engineer Agent system.
"""
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm, mm
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle,
    KeepTogether, Image, Flowable
)
from reportlab.platypus.tableofcontents import TableOfContents
from reportlab.graphics.shapes import Drawing, Rect, String, Line, Polygon, Circle
from reportlab.graphics.charts.barcharts import VerticalBarChart
from reportlab.graphics.charts.piecharts import Pie
from reportlab.pdfgen import canvas

OUT = r"C:\Users\hp\Byfoods\AI_Staff_Engineer_Agent_Architecture.pdf"

# ----- Colors -----
PRIMARY = colors.HexColor("#0B3D91")
ACCENT = colors.HexColor("#1F8FFF")
DARK = colors.HexColor("#0E1726")
SOFT = colors.HexColor("#F4F7FB")
SUCCESS = colors.HexColor("#16A34A")
WARN = colors.HexColor("#F59E0B")
DANGER = colors.HexColor("#DC2626")
GREY = colors.HexColor("#475569")
LIGHTGREY = colors.HexColor("#E2E8F0")

# ----- Styles -----
styles = getSampleStyleSheet()

title_style = ParagraphStyle(
    "CoverTitle", parent=styles["Title"],
    fontName="Helvetica-Bold", fontSize=30, leading=36,
    textColor=PRIMARY, alignment=TA_CENTER, spaceAfter=14)

subtitle_style = ParagraphStyle(
    "CoverSub", parent=styles["Title"],
    fontName="Helvetica", fontSize=14, leading=20,
    textColor=GREY, alignment=TA_CENTER, spaceAfter=10)

h1 = ParagraphStyle(
    "H1", parent=styles["Heading1"],
    fontName="Helvetica-Bold", fontSize=20, leading=26,
    textColor=PRIMARY, spaceBefore=18, spaceAfter=12)

h2 = ParagraphStyle(
    "H2", parent=styles["Heading2"],
    fontName="Helvetica-Bold", fontSize=15, leading=20,
    textColor=DARK, spaceBefore=12, spaceAfter=8)

h3 = ParagraphStyle(
    "H3", parent=styles["Heading3"],
    fontName="Helvetica-Bold", fontSize=12, leading=16,
    textColor=ACCENT, spaceBefore=8, spaceAfter=4)

body = ParagraphStyle(
    "Body", parent=styles["BodyText"],
    fontName="Helvetica", fontSize=10.5, leading=15,
    textColor=DARK, alignment=TA_JUSTIFY, spaceAfter=8)

bullet = ParagraphStyle(
    "Bullet", parent=body, leftIndent=14, bulletIndent=4, spaceAfter=4)

quote = ParagraphStyle(
    "Quote", parent=body, leftIndent=18, rightIndent=18,
    textColor=GREY, fontName="Helvetica-Oblique",
    borderColor=ACCENT, borderPadding=8, borderWidth=0,
    backColor=SOFT, spaceBefore=6, spaceAfter=10)

code = ParagraphStyle(
    "Code", parent=body, fontName="Courier", fontSize=9.5,
    textColor=DARK, backColor=SOFT, leading=13,
    leftIndent=10, rightIndent=10, spaceBefore=4, spaceAfter=8)

note = ParagraphStyle(
    "Note", parent=body, fontName="Helvetica-Oblique",
    textColor=GREY, fontSize=9.5, leading=13)


# ===== Helpers =====
def H1(text, story, toc=True):
    """Heading 1 with TOC bookmark."""
    bm = "h1_" + str(len(story))
    p = Paragraph(f'<a name="{bm}"/>{text}', h1)
    story.append(p)

def H2(text, story):
    story.append(Paragraph(text, h2))

def H3(text, story):
    story.append(Paragraph(text, h3))

def P(text, story):
    story.append(Paragraph(text, body))

def B(text, story):
    story.append(Paragraph(text, bullet, bulletText="•"))

def Q(text, story):
    story.append(Paragraph(text, quote))

def C(text, story):
    text = text.replace("<", "&lt;").replace(">", "&gt;").replace("\n", "<br/>")
    story.append(Paragraph(text, code))

def NOTE(text, story):
    story.append(Paragraph(text, note))


# ===== Visual Boxes / Diagrams =====
class Box(Flowable):
    """Simple colored box with title + lines."""
    def __init__(self, title, lines, w=15*cm, color=PRIMARY, text_color=colors.white):
        super().__init__()
        self.title = title
        self.lines = lines
        self.w = w
        self.color = color
        self.text_color = text_color
        self.h = 0.95*cm + 0.5*cm*len(lines) + 0.3*cm

    def wrap(self, *args):
        return self.w, self.h

    def draw(self):
        c = self.canv
        c.setFillColor(self.color)
        c.roundRect(0, 0, self.w, self.h, 6, fill=1, stroke=0)
        c.setFillColor(self.text_color)
        c.setFont("Helvetica-Bold", 12)
        c.drawString(0.4*cm, self.h - 0.7*cm, self.title)
        c.setFont("Helvetica", 10)
        y = self.h - 1.3*cm
        for line in self.lines:
            c.drawString(0.5*cm, y, line)
            y -= 0.5*cm


def arrow_down(width=15*cm, color=GREY):
    d = Drawing(width, 0.9*cm)
    mid = width/2
    d.add(Line(mid, 0.85*cm, mid, 0.25*cm, strokeColor=color, strokeWidth=2))
    d.add(Polygon([mid-6, 0.3*cm, mid+6, 0.3*cm, mid, 0],
                  fillColor=color, strokeColor=color))
    return d


def stack_diagram(title, layers, story):
    """Vertical stack of boxes with arrows."""
    story.append(Paragraph(f"<b>{title}</b>", h3))
    for i, (name, desc, c1, c2) in enumerate(layers):
        b = Box(name, [desc], w=14*cm, color=c1, text_color=c2)
        story.append(b)
        if i < len(layers) - 1:
            story.append(arrow_down(14*cm))
    story.append(Spacer(1, 6))


def kv_table(rows, story, col_widths=(5*cm, 11*cm), header=None):
    data = []
    if header:
        data.append(header)
    data.extend(rows)
    t = Table(data, colWidths=col_widths)
    style = [
        ("FONTNAME", (0,0), (-1,-1), "Helvetica"),
        ("FONTSIZE", (0,0), (-1,-1), 10),
        ("VALIGN", (0,0), (-1,-1), "TOP"),
        ("ROWBACKGROUNDS", (0,0), (-1,-1), [colors.white, SOFT]),
        ("LINEBELOW", (0,0), (-1,-1), 0.25, LIGHTGREY),
        ("LEFTPADDING", (0,0), (-1,-1), 8),
        ("RIGHTPADDING", (0,0), (-1,-1), 8),
        ("TOPPADDING", (0,0), (-1,-1), 6),
        ("BOTTOMPADDING", (0,0), (-1,-1), 6),
    ]
    if header:
        style.append(("BACKGROUND", (0,0), (-1,0), PRIMARY))
        style.append(("TEXTCOLOR", (0,0), (-1,0), colors.white))
        style.append(("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"))
    t.setStyle(TableStyle(style))
    story.append(t)
    story.append(Spacer(1, 8))


# ===== Custom Diagrams =====
def draw_multiagent_diagram():
    """Orchestrator with agents around it."""
    d = Drawing(16*cm, 9*cm)
    cx, cy = 8*cm, 4.5*cm
    # Center
    d.add(Rect(cx-2*cm, cy-0.6*cm, 4*cm, 1.2*cm, fillColor=PRIMARY, strokeColor=PRIMARY))
    d.add(String(cx, cy-0.1*cm, "Orchestrator", fontName="Helvetica-Bold",
                 fontSize=11, fillColor=colors.white, textAnchor="middle"))
    # Surrounding agents
    agents = [
        ("Repo Analyzer", -6*cm, 3*cm, ACCENT),
        ("Code Review",   -6*cm, 0,    ACCENT),
        ("Architecture",  -6*cm, -3*cm, ACCENT),
        ("Impact",         6*cm, 3*cm, SUCCESS),
        ("Security",       6*cm, 0,    DANGER),
        ("Scalability",    6*cm, -3*cm, WARN),
    ]
    for name, dx, dy, color in agents:
        x = cx + dx - 1.6*cm
        y = cy + dy - 0.5*cm
        d.add(Rect(x, y, 3.2*cm, 1*cm, fillColor=color, strokeColor=color))
        d.add(String(x + 1.6*cm, y + 0.3*cm, name, fontName="Helvetica-Bold",
                     fontSize=9.5, fillColor=colors.white, textAnchor="middle"))
        # connecting line
        d.add(Line(cx + (dx/abs(dx))* (2*cm if dx else 0),
                   cy + (dy/max(abs(dy),1))*(0.6*cm if dy else 0) if dy else cy,
                   x + (1.6*cm if dx < 0 else 1.6*cm),
                   y + 0.5*cm, strokeColor=GREY, strokeWidth=1))
    return d


def draw_context_packs_diagram():
    """Visual representation of context packs the user can drag in."""
    d = Drawing(16*cm, 8*cm)
    # User workspace area
    d.add(Rect(0, 0, 16*cm, 8*cm, fillColor=SOFT, strokeColor=LIGHTGREY))
    d.add(String(8*cm, 7.4*cm, "Visual Context Workspace",
                 fontName="Helvetica-Bold", fontSize=12,
                 fillColor=DARK, textAnchor="middle"))
    # Packs
    packs = [
        ("Auth Module",     0.6*cm, 5*cm, ACCENT),
        ("User Schema",     4.0*cm, 5*cm, SUCCESS),
        ("Payment Flow",    7.4*cm, 5*cm, WARN),
        ("API Gateway",    10.8*cm, 5*cm, PRIMARY),
        ("DB Migrations",  13.4*cm, 5*cm, DANGER),
    ]
    for name, x, y, color in packs:
        d.add(Rect(x, y, 2.2*cm, 1.4*cm, fillColor=color, strokeColor=color))
        d.add(String(x + 1.1*cm, y + 0.5*cm, name, fontName="Helvetica-Bold",
                     fontSize=8.5, fillColor=colors.white, textAnchor="middle"))
    # Agent input
    d.add(Rect(5*cm, 1*cm, 6*cm, 2.5*cm,
               fillColor=PRIMARY, strokeColor=PRIMARY))
    d.add(String(8*cm, 2.6*cm, "Agent Context Window",
                 fontName="Helvetica-Bold", fontSize=11,
                 fillColor=colors.white, textAnchor="middle"))
    d.add(String(8*cm, 1.8*cm, "Attached: Auth + User Schema",
                 fontName="Helvetica", fontSize=9,
                 fillColor=colors.white, textAnchor="middle"))
    d.add(String(8*cm, 1.3*cm, "Tokens used: 4.2k / 200k",
                 fontName="Helvetica", fontSize=9,
                 fillColor=colors.white, textAnchor="middle"))
    # Arrows down from selected packs
    for name, x, y, color in packs[:2]:
        d.add(Line(x + 1.1*cm, y, x + 1.1*cm, 3.5*cm,
                   strokeColor=color, strokeWidth=1.5,
                   strokeDashArray=[3,2]))
    return d


def draw_memory_layers_diagram():
    """4-layer memory pyramid."""
    d = Drawing(16*cm, 9*cm)
    layers = [
        ("L4 - Immediate Working Memory (current chat)",  0.5*cm, 1.2*cm, ACCENT),
        ("L3 - Session Memory (last hour)",               2.0*cm, 1.2*cm, PRIMARY),
        ("L2 - Project Memory (persistent)",              3.5*cm, 1.2*cm, SUCCESS),
        ("L1 - Long-Term Knowledge Graph (Neo4j)",        5.0*cm, 1.2*cm, DARK),
    ]
    for name, y, h, color in layers:
        width = 13*cm - (y - 0.5*cm)*0.6
        x = (16*cm - width) / 2
        d.add(Rect(x, y, width, h, fillColor=color, strokeColor=color))
        d.add(String(8*cm, y + h/2 - 0.1*cm, name,
                     fontName="Helvetica-Bold", fontSize=10,
                     fillColor=colors.white, textAnchor="middle"))
    d.add(String(8*cm, 7.8*cm, "Memory Hierarchy",
                 fontName="Helvetica-Bold", fontSize=13,
                 fillColor=DARK, textAnchor="middle"))
    d.add(String(8*cm, 7.2*cm, "Bottom = cheap, slow, persistent. Top = expensive, fast, ephemeral.",
                 fontName="Helvetica-Oblique", fontSize=9,
                 fillColor=GREY, textAnchor="middle"))
    return d


def draw_token_savings_chart():
    """Bar chart: tokens without packs vs with packs."""
    d = Drawing(15*cm, 8*cm)
    chart = VerticalBarChart()
    chart.x = 60
    chart.y = 40
    chart.width = 380
    chart.height = 180
    chart.data = [
        [180, 95, 42, 18],  # Without packs
        [22,  18, 14, 11],  # With packs
    ]
    chart.categoryAxis.categoryNames = [
        "Repo Q&A", "Code Review", "Impact Analysis", "Doc Gen"
    ]
    chart.bars[0].fillColor = DANGER
    chart.bars[1].fillColor = SUCCESS
    chart.valueAxis.valueMin = 0
    chart.valueAxis.valueMax = 200
    chart.valueAxis.valueStep = 25
    chart.categoryAxis.labels.fontSize = 9
    chart.valueAxis.labels.fontSize = 9
    d.add(chart)
    d.add(String(240, 250, "Tokens consumed per task (in thousands)",
                 fontName="Helvetica-Bold", fontSize=12,
                 fillColor=DARK, textAnchor="middle"))
    # Legend
    d.add(Rect(60, 10, 12, 12, fillColor=DANGER, strokeColor=DANGER))
    d.add(String(78, 14, "Without Context Packs", fontSize=9, fillColor=DARK))
    d.add(Rect(220, 10, 12, 12, fillColor=SUCCESS, strokeColor=SUCCESS))
    d.add(String(238, 14, "With Context Packs", fontSize=9, fillColor=DARK))
    return d


def draw_pipeline_diagram():
    """Horizontal repository indexing pipeline."""
    d = Drawing(16*cm, 5*cm)
    steps = [
        ("Clone\nRepo", PRIMARY),
        ("Tree-sitter\nParse", ACCENT),
        ("Build\nKnowledge\nGraph", SUCCESS),
        ("Embed\nChunks", WARN),
        ("Store in\nQdrant +\nNeo4j", DARK),
    ]
    w = 2.8*cm
    gap = 0.4*cm
    total = len(steps) * w + (len(steps) - 1) * gap
    x = (16*cm - total) / 2
    for i, (name, color) in enumerate(steps):
        d.add(Rect(x, 1.5*cm, w, 2.5*cm, fillColor=color, strokeColor=color))
        for j, line in enumerate(name.split("\n")):
            d.add(String(x + w/2, 3.4*cm - j*0.45*cm, line,
                         fontName="Helvetica-Bold", fontSize=9.5,
                         fillColor=colors.white, textAnchor="middle"))
        if i < len(steps) - 1:
            ax = x + w
            d.add(Line(ax + 0.05*cm, 2.75*cm, ax + gap - 0.05*cm, 2.75*cm,
                       strokeColor=GREY, strokeWidth=1.5))
            d.add(Polygon([ax + gap - 0.15*cm, 2.65*cm,
                           ax + gap - 0.15*cm, 2.85*cm,
                           ax + gap, 2.75*cm],
                          fillColor=GREY, strokeColor=GREY))
        x += w + gap
    d.add(String(8*cm, 4.5*cm, "Repository Indexing Pipeline",
                 fontName="Helvetica-Bold", fontSize=12,
                 fillColor=DARK, textAnchor="middle"))
    return d


def draw_kg_schema():
    """Neo4j-style node/relationship sketch."""
    d = Drawing(16*cm, 9*cm)
    nodes = [
        ("File", 2*cm, 7*cm, PRIMARY),
        ("Class", 7*cm, 7*cm, ACCENT),
        ("Function", 12*cm, 7*cm, SUCCESS),
        ("Module", 2*cm, 3*cm, WARN),
        ("DB Table", 7*cm, 3*cm, DANGER),
        ("API Endpoint", 12*cm, 3*cm, DARK),
    ]
    for name, x, y, color in nodes:
        d.add(Circle(x, y, 0.9*cm, fillColor=color, strokeColor=color))
        d.add(String(x, y - 0.1*cm, name, fontName="Helvetica-Bold",
                     fontSize=9, fillColor=colors.white, textAnchor="middle"))
    # Relationships
    rels = [
        (2, 7, 7, 7, "CONTAINS"),
        (7, 7, 12, 7, "DEFINES"),
        (12, 7, 7, 3, "READS"),
        (12, 7, 12, 3, "EXPOSED_BY"),
        (12, 7, 2, 3, "IMPORTS"),
        (7, 3, 12, 3, "BACKS"),
    ]
    for x1, y1, x2, y2, label in rels:
        d.add(Line(x1*cm, y1*cm, x2*cm, y2*cm,
                   strokeColor=GREY, strokeWidth=0.8))
        mx, my = (x1+x2)/2*cm, (y1+y2)/2*cm
        d.add(String(mx, my, label, fontName="Helvetica", fontSize=7.5,
                     fillColor=GREY, textAnchor="middle"))
    d.add(String(8*cm, 8.5*cm, "Knowledge Graph Schema (Neo4j)",
                 fontName="Helvetica-Bold", fontSize=12,
                 fillColor=DARK, textAnchor="middle"))
    return d


def draw_vibecode_pie():
    d = Drawing(15*cm, 7*cm)
    pie = Pie()
    pie.x = 100
    pie.y = 10
    pie.width = 160
    pie.height = 160
    pie.data = [82, 18]
    pie.labels = ["AI-likely 82%", "Human 18%"]
    pie.slices.strokeColor = colors.white
    pie.slices[0].fillColor = ACCENT
    pie.slices[1].fillColor = SUCCESS
    pie.slices.fontName = "Helvetica-Bold"
    pie.slices.fontSize = 10
    d.add(pie)
    # legend / explanation
    d.add(String(310, 150, "Signals Detected:", fontName="Helvetica-Bold",
                 fontSize=11, fillColor=DARK))
    msgs = [
        "- Uniform docstring style across files",
        "- Generic identifier names (data, result)",
        "- Repeated try/except boilerplate",
        "- Over-defensive null checks",
        "- Identical helper signatures",
        "- Markdown-flavored inline comments",
    ]
    for i, m in enumerate(msgs):
        d.add(String(310, 130 - i*15, m, fontName="Helvetica",
                     fontSize=9.5, fillColor=GREY))
    return d


def draw_langgraph_flow():
    d = Drawing(16*cm, 9*cm)
    nodes = [
        ("Plan",        2*cm, 7*cm, PRIMARY),
        ("Retrieve",    6*cm, 7*cm, ACCENT),
        ("Analyze",    10*cm, 7*cm, ACCENT),
        ("Critique",   14*cm, 7*cm, WARN),
        ("Synthesize",  6*cm, 3*cm, SUCCESS),
        ("Verify",     10*cm, 3*cm, DANGER),
        ("Return",     14*cm, 3*cm, DARK),
    ]
    for name, x, y, color in nodes:
        d.add(Rect(x - 1.2*cm, y - 0.5*cm, 2.4*cm, 1*cm,
                   fillColor=color, strokeColor=color))
        d.add(String(x, y - 0.1*cm, name, fontName="Helvetica-Bold",
                     fontSize=10, fillColor=colors.white, textAnchor="middle"))
    edges = [
        (2, 7, 6, 7), (6, 7, 10, 7), (10, 7, 14, 7),
        (14, 7, 6, 3), (6, 3, 10, 3), (10, 3, 14, 3),
        (10, 3, 6, 7),  # loopback on verify failure
    ]
    for x1, y1, x2, y2 in edges:
        d.add(Line(x1*cm, y1*cm, x2*cm, y2*cm,
                   strokeColor=GREY, strokeWidth=1))
    d.add(String(8*cm, 8.5*cm, "LangGraph Agent Workflow",
                 fontName="Helvetica-Bold", fontSize=12,
                 fillColor=DARK, textAnchor="middle"))
    d.add(String(8*cm, 1.5*cm,
                 "Loopback on failed verification keeps the agent honest.",
                 fontName="Helvetica-Oblique", fontSize=9,
                 fillColor=GREY, textAnchor="middle"))
    return d


# ===== Header / Footer =====
def header_footer(canv, doc):
    canv.saveState()
    # Header
    canv.setFillColor(PRIMARY)
    canv.rect(0, A4[1] - 1.2*cm, A4[0], 1.2*cm, fill=1, stroke=0)
    canv.setFillColor(colors.white)
    canv.setFont("Helvetica-Bold", 10)
    canv.drawString(1.5*cm, A4[1] - 0.8*cm, "AI Staff Engineer Agent")
    canv.setFont("Helvetica", 9)
    canv.drawRightString(A4[0] - 1.5*cm, A4[1] - 0.8*cm,
                         "Architecture & Design Specification")
    # Footer
    canv.setFillColor(GREY)
    canv.setFont("Helvetica", 9)
    canv.drawString(1.5*cm, 0.8*cm, "Confidential Draft - v1.0")
    canv.drawRightString(A4[0] - 1.5*cm, 0.8*cm, f"Page {doc.page}")
    canv.setStrokeColor(LIGHTGREY)
    canv.line(1.5*cm, 1.2*cm, A4[0] - 1.5*cm, 1.2*cm)
    canv.restoreState()


# ===== Build Document =====
def build():
    doc = SimpleDocTemplate(
        OUT, pagesize=A4,
        leftMargin=1.6*cm, rightMargin=1.6*cm,
        topMargin=1.8*cm, bottomMargin=1.6*cm,
        title="AI Staff Engineer Agent - Architecture Specification",
        author="Architecture Working Draft")

    story = []

    # ----- COVER -----
    story.append(Spacer(1, 5*cm))
    story.append(Paragraph("AI Staff Engineer Agent", title_style))
    story.append(Paragraph(
        "An Agentic System for Repository Understanding,<br/>"
        "Impact Analysis, and Autonomous Code Reasoning",
        subtitle_style))
    story.append(Spacer(1, 2*cm))
    story.append(Paragraph(
        "Architecture &amp; Design Specification", h2))
    story.append(Spacer(1, 0.4*cm))
    cover_table = Table([
        ["Version",        "1.0"],
        ["Document Type",  "Technical Architecture"],
        ["Audience",       "Founders, Engineers, Architects"],
        ["Form Factor",    "Agent (not a Web App)"],
        ["Status",         "Working Draft"],
    ], colWidths=[5*cm, 9*cm])
    cover_table.setStyle(TableStyle([
        ("FONTNAME", (0,0), (-1,-1), "Helvetica"),
        ("FONTSIZE", (0,0), (-1,-1), 10.5),
        ("TEXTCOLOR", (0,0), (0,-1), PRIMARY),
        ("FONTNAME", (0,0), (0,-1), "Helvetica-Bold"),
        ("ROWBACKGROUNDS", (0,0), (-1,-1), [SOFT, colors.white]),
        ("LEFTPADDING", (0,0), (-1,-1), 10),
        ("RIGHTPADDING", (0,0), (-1,-1), 10),
        ("TOPPADDING", (0,0), (-1,-1), 7),
        ("BOTTOMPADDING", (0,0), (-1,-1), 7),
    ]))
    story.append(cover_table)
    story.append(PageBreak())

    # ----- TABLE OF CONTENTS -----
    H1("Table of Contents", story)
    toc_entries = [
        "1. Executive Summary",
        "2. Vision and Objectives",
        "3. Why an Agent Instead of a Web App",
        "4. High-Level Architecture",
        "5. Multi-Agent System Design",
        "6. The Orchestrator Agent",
        "7. Repository Analyzer Agent",
        "8. Code Review Agent",
        "9. Architecture Agent",
        "10. Impact Analysis Agent",
        "11. Security Agent",
        "12. Performance Agent",
        "13. Scalability Agent",
        "14. Documentation Agent",
        "15. Human vs Vibe-Code Detection",
        "16. Tree-sitter Parsing Pipeline",
        "17. Knowledge Graph Design with Neo4j",
        "18. Vector Memory with Qdrant",
        "19. Context Compression Strategies",
        "20. User-Managed Visual Context System",
        "21. Token Saving Strategies",
        "22. Context Packs",
        "23. Visual Workspace Design",
        "24. GraphRAG for Code",
        "25. Long-Term Memory Layers",
        "26. LangGraph Workflows",
        "27. MCP Server Integration",
        "28. Local LLM Support",
        "29. Cost Optimization",
        "30. MVP Roadmap",
        "31. Future Autonomous Capabilities",
        "32. Competitive Analysis",
        "33. Risks and Limitations",
        "34. Production Architecture",
        "35. Conclusion",
    ]
    toc_rows = [[entry] for entry in toc_entries]
    toc_table = Table(toc_rows, colWidths=[16*cm])
    toc_table.setStyle(TableStyle([
        ("FONTNAME", (0,0), (-1,-1), "Helvetica"),
        ("FONTSIZE", (0,0), (-1,-1), 11),
        ("TEXTCOLOR", (0,0), (-1,-1), DARK),
        ("LINEBELOW", (0,0), (-1,-1), 0.25, LIGHTGREY),
        ("LEFTPADDING", (0,0), (-1,-1), 6),
        ("TOPPADDING", (0,0), (-1,-1), 5),
        ("BOTTOMPADDING", (0,0), (-1,-1), 5),
    ]))
    story.append(toc_table)
    story.append(PageBreak())

    # ===== 1. EXECUTIVE SUMMARY =====
    H1("1. Executive Summary", story)
    P("The AI Staff Engineer Agent is an agentic software system designed "
      "to behave like a senior staff engineer embedded inside a codebase. "
      "Unlike conventional code-assistant web applications, it runs as a "
      "persistent, tool-using agent that understands an entire repository, "
      "maintains long-term memory, performs impact analysis, reviews code, "
      "estimates scalability, and answers architectural questions with "
      "concrete file-level evidence.", story)
    P("This document specifies the architecture, agents, data systems, "
      "context-engineering strategy, and roadmap required to build the "
      "system. It also introduces a visually-driven context management "
      "model so that users can manually attach and detach context blocks, "
      "preserving token budgets across long sessions and avoiding the "
      "cost spirals associated with naive RAG.", story)
    H2("Core Promise", story)
    Q("\"Given any repository, the agent can answer: <i>what will break "
      "if I make this change, who depends on this code, how does this "
      "scale, and what should we build next?</i>\"", story)
    H2("Key Differentiators", story)
    B("Multi-agent orchestration with specialized roles (review, "
      "architecture, security, impact, scalability).", story)
    B("Persistent knowledge graph of files, classes, functions, and "
      "dependencies stored in Neo4j.", story)
    B("Hybrid retrieval combining semantic embeddings (Qdrant) with "
      "graph traversal (GraphRAG).", story)
    B("Visual context workspace where users drag, drop, attach, and "
      "detach context packs to control token spend.", story)
    B("Human vs AI-generated (Vibe Code) detection with probabilistic "
      "scoring.", story)
    B("MCP integration so the agent can plug into existing tools "
      "(Slack, GitHub, Linear, Sentry).", story)
    story.append(PageBreak())

    # ===== 2. VISION AND OBJECTIVES =====
    H1("2. Vision and Objectives", story)
    P("Most code intelligence tools today fall into three buckets: code "
      "completion (Copilot, Cursor), static analyzers (SonarQube, "
      "Semgrep), and pull-request reviewers (CodeRabbit). None of them "
      "embodies the role of a staff-level engineer who holds the whole "
      "system in their head, anticipates blast radius before any commit "
      "is made, and reasons about non-functional requirements.", story)
    H2("Vision Statement", story)
    Q("Build an agent that any team can hire as a tireless staff "
      "engineer - one that learns every line of the codebase, remembers "
      "every decision, predicts the consequences of every change, and "
      "explains its reasoning with citations.", story)
    H2("Primary Objectives", story)
    kv_table([
        ["Repository Mastery",
         "Index, embed, and graph every file in a codebase up to 10M LOC."],
        ["Impact Prediction",
         "For any proposed change, list affected files, APIs, tables, "
         "and risk score."],
        ["Architectural Reasoning",
         "Answer questions about coupling, layering, and scalability."],
        ["Reviewer-Grade Critique",
         "Match or exceed CodeRabbit/Sonar on actionable PR comments."],
        ["Operator-Friendly",
         "Run anywhere - CLI, IDE, MCP, or background daemon."],
        ["Visual Context Control",
         "Let users pick exactly which knowledge enters the prompt."],
    ], story, col_widths=(5*cm, 11*cm),
       header=["Objective", "Description"])
    H2("Non-Goals", story)
    B("Not a code editor or IDE. The agent integrates with editors but "
      "does not replace them.", story)
    B("Not a chatbot wrapper. Plain RAG over README files is "
      "deliberately insufficient.", story)
    B("Not a single-model monolith. The architecture is model-agnostic.", story)
    story.append(PageBreak())

    # ===== 3. AGENT VS WEB APP =====
    H1("3. Why an Agent Instead of a Web App", story)
    P("Treating this product as a web application would force every "
      "interaction through a UI layer, decouple the agent from the "
      "developer's actual environment, and reduce it to a chat window "
      "with retrieval. An agent form factor has structural advantages.", story)
    H2("Comparison", story)
    kv_table([
        ["Deployment",       "Single web app",       "CLI, IDE, MCP server, daemon"],
        ["Context Source",   "Manual paste / upload","Live access to repo and tools"],
        ["Memory",           "Session-bound",        "Persistent across sessions"],
        ["Tool Use",         "Limited",              "Native tool/MCP invocation"],
        ["User Workflow",    "Switch tabs",          "Inline, where work happens"],
        ["Auth Surface",     "Custom OAuth + roles", "Reuses existing dev creds"],
        ["Cost Profile",     "Per-seat SaaS",        "Pay-per-token + infra"],
    ], story, col_widths=(4*cm, 6*cm, 6*cm),
       header=["Dimension", "Web App", "Agent"])
    H2("Operational Implication", story)
    P("Because the agent lives where developers already work, it can be "
      "invoked through a slash command, a Git hook, a CI step, or an MCP "
      "call. This removes friction and gives the agent direct exposure "
      "to ground-truth artifacts - diffs, logs, test output - without "
      "manual copy/paste.", story)
    story.append(PageBreak())

    # ===== 4. HIGH-LEVEL ARCHITECTURE =====
    H1("4. High-Level Architecture", story)
    P("The system is composed of seven logical layers. The agent core "
      "sits at the center, with retrieval and memory subsystems feeding "
      "context, and a tool layer providing the ability to act.", story)
    story.append(Spacer(1, 6))
    story.append(draw_multiagent_diagram())
    story.append(Spacer(1, 6))
    H2("Layered View", story)
    layers = [
        ("Interface Layer",
         "CLI, IDE plugin, MCP, GitHub bot",
         PRIMARY, colors.white),
        ("Orchestrator",
         "Planner + router across specialized agents",
         ACCENT, colors.white),
        ("Specialized Agents",
         "Review, Architecture, Impact, Security, Scalability",
         SUCCESS, colors.white),
        ("Retrieval Layer",
         "Qdrant (semantic) + Neo4j (graph) + BM25",
         WARN, colors.white),
        ("Memory Layer",
         "Episodic, project, long-term knowledge graph",
         DARK, colors.white),
        ("Tool Layer",
         "Git, file system, shell, HTTP, MCP servers",
         GREY, colors.white),
        ("Infra",
         "Postgres, Redis, BullMQ, S3, observability",
         colors.HexColor("#334155"), colors.white),
    ]
    stack_diagram("System Stack", layers, story)
    story.append(PageBreak())

    # ===== 5. MULTI-AGENT DESIGN =====
    H1("5. Multi-Agent System Design", story)
    P("Splitting the agent into specialized roles improves reliability "
      "and reduces context bloat. Each agent owns a narrow responsibility "
      "with its own system prompt, tools, and evaluation criteria.", story)
    kv_table([
        ["Orchestrator",       "Plans, routes, supervises"],
        ["Repository Analyzer","Indexes and embeds the codebase"],
        ["Code Review",        "Finds bugs and smells in diffs"],
        ["Architecture",       "Reasons about structure and coupling"],
        ["Impact",             "Predicts blast radius of changes"],
        ["Security",           "Scans for vulnerabilities and secrets"],
        ["Performance",        "Spots hot paths and inefficiencies"],
        ["Scalability",        "Estimates capacity and bottlenecks"],
        ["Documentation",      "Generates and maintains docs"],
    ], story, header=["Agent", "Responsibility"])
    H2("Coordination Pattern", story)
    P("Agents communicate through structured messages carrying citations "
      "(file path + line range + commit SHA). The Orchestrator is the "
      "only agent allowed to talk to the user; sub-agents return raw "
      "structured findings.", story)
    P("This separation gives us testability: each sub-agent can be "
      "evaluated independently against a benchmark of expected outputs.", story)
    story.append(PageBreak())

    # ===== 6. ORCHESTRATOR =====
    H1("6. The Orchestrator Agent", story)
    P("The Orchestrator is responsible for turning a user request into "
      "a plan, dispatching sub-agents in parallel where possible, and "
      "synthesizing their findings into a single coherent answer.", story)
    H2("Responsibilities", story)
    B("Intent classification (review vs question vs change request).", story)
    B("Context budgeting - decides how many tokens to allocate per sub-agent.", story)
    B("Parallel fan-out using LangGraph parallel branches.", story)
    B("Conflict resolution when two sub-agents disagree.", story)
    B("Final answer composition with citations.", story)
    H2("Planner Output Schema", story)
    C("{\n"
      "  \"plan\": [\n"
      "    {\"agent\": \"impact\",   \"query\": \"...\"},\n"
      "    {\"agent\": \"security\", \"query\": \"...\"},\n"
      "    {\"agent\": \"review\",   \"query\": \"...\"}\n"
      "  ],\n"
      "  \"budget_tokens\": 80000,\n"
      "  \"deadline_ms\":   45000,\n"
      "  \"strategy\":      \"parallel\"\n"
      "}", story)
    story.append(PageBreak())

    # ===== 7. REPOSITORY ANALYZER =====
    H1("7. Repository Analyzer Agent", story)
    P("This agent owns repository ingestion. It clones, parses, chunks, "
      "embeds, and stores both semantic vectors and graph relationships. "
      "Incremental indexing keeps the system in sync with commits.", story)
    story.append(draw_pipeline_diagram())
    story.append(Spacer(1, 6))
    H2("Chunking Strategy", story)
    P("Naive line-window chunking ruins code semantics. We use "
      "<b>AST-aware chunking</b>: each chunk is a complete function, "
      "class, or top-level statement. Long functions are split at "
      "logical boundaries (loop bodies, branches) with overlap.", story)
    H2("Incremental Updates", story)
    P("Each commit triggers a re-index of only changed files plus their "
      "first-degree graph neighbors. Embeddings are versioned with the "
      "commit SHA so historical analysis remains possible.", story)
    story.append(PageBreak())

    # ===== 8. CODE REVIEW AGENT =====
    H1("8. Code Review Agent", story)
    P("The reviewer reads a diff, fetches surrounding context using the "
      "graph, and produces severity-tagged comments. Each comment is "
      "anchored to a specific file and line.", story)
    H2("Severity Model", story)
    kv_table([
        ["Critical", "Will crash production or expose data"],
        ["High",     "Likely incorrect under normal load"],
        ["Medium",   "Smell, dead code, leak risk"],
        ["Low",      "Style, naming, micro-perf"],
        ["Info",     "Refactor suggestion, FYI"],
    ], story, header=["Severity", "Meaning"])
    H2("Example Output", story)
    C("{\n"
      "  \"file\": \"src/orders.ts\",\n"
      "  \"line\": 142,\n"
      "  \"severity\": \"high\",\n"
      "  \"category\": \"correctness\",\n"
      "  \"message\": \"Race: cart total mutated\\n"
      "  before lock acquired.\",\n"
      "  \"fix\": \"Move calculation inside withLock()\"\n"
      "}", story)
    H2("Why Structured Output Matters", story)
    P("Structured findings let downstream consumers (PR bots, dashboards, "
      "Slack notifiers) route by severity and category without parsing "
      "natural language. This is critical for trust in automated review.", story)
    story.append(PageBreak())

    # ===== 9. ARCHITECTURE AGENT =====
    H1("9. Architecture Agent", story)
    P("The Architecture Agent reasons about system shape - which "
      "modules depend on which, where layering is violated, and which "
      "components are doing too much.", story)
    H2("Signals It Inspects", story)
    B("Inbound and outbound coupling per module.", story)
    B("Layer violations (e.g. UI importing repository directly).", story)
    B("God objects and oversized files.", story)
    B("Circular dependencies in the import graph.", story)
    B("Hotspots - files churned and changed by many authors.", story)
    H2("Tools Available", story)
    P("The agent can call <i>graphQuery</i>, <i>cypher</i>, "
      "<i>countLines</i>, and <i>computeCentrality</i>. These tools run "
      "deterministic analyses on the graph; the LLM only narrates the "
      "results.", story)
    story.append(PageBreak())

    # ===== 10. IMPACT ANALYSIS =====
    H1("10. Impact Analysis Agent", story)
    P("Impact analysis is the agent's most differentiated capability. "
      "Given a proposed change - a function signature, a column rename, "
      "a removed endpoint - it returns a ranked list of affected entities.", story)
    H2("Algorithm", story)
    P("Starting from the changed node in the knowledge graph, the agent "
      "performs a bounded BFS along call-graph and data-flow edges. Each "
      "downstream node is scored by:", story)
    B("Edge weight (direct call vs transitive dependency).", story)
    B("Test coverage of the path.", story)
    B("Historical co-change frequency.", story)
    B("Public-API exposure.", story)
    H2("Sample Output", story)
    C("Change: rename column users.email to users.email_address\n"
      "\n"
      "Affected (12):\n"
      "  - src/auth/login.ts:34          [direct read]\n"
      "  - src/billing/invoice.ts:89     [direct read]\n"
      "  - migrations/0042.sql           [referenced]\n"
      "  - api/v1/users.ts:GET /me       [public API]\n"
      "  ... 8 more\n"
      "\n"
      "Risk: HIGH (touches public API + billing)\n"
      "Tests covering change paths: 41%", story)
    story.append(PageBreak())

    # ===== 11. SECURITY =====
    H1("11. Security Agent", story)
    P("The Security Agent runs a battery of checks combining static "
      "patterns, taint analysis, and LLM reasoning. It looks for OWASP "
      "Top 10 issues, secret leaks, and unsafe deserialization.", story)
    H2("Detection Sources", story)
    kv_table([
        ["Pattern match",   "Semgrep, custom rules"],
        ["Taint analysis",  "Track tainted user input to sinks"],
        ["Secret scan",     "Entropy + dictionary"],
        ["LLM reasoning",   "Catch logic flaws missed by patterns"],
        ["Dependency scan", "Known CVEs in lockfiles"],
    ], story, header=["Source", "Method"])
    H2("Confidence Calibration", story)
    P("Each finding carries a confidence score derived from how many "
      "independent detectors flagged it. Findings below 0.4 confidence "
      "are queued for human review rather than auto-commented.", story)
    story.append(PageBreak())

    # ===== 12. PERFORMANCE =====
    H1("12. Performance Agent", story)
    P("Performance issues rarely show in code review. The Performance "
      "Agent combines static analysis with optional runtime traces.", story)
    H2("Static Signals", story)
    B("N+1 query patterns in ORMs.", story)
    B("Synchronous I/O on hot paths.", story)
    B("Unbounded loops over external data.", story)
    B("Missing pagination on collection endpoints.", story)
    B("Inefficient algorithm choices (e.g. O(n^2) over n>10k).", story)
    H2("Runtime Signals (optional)", story)
    B("Profile imports (pprof, py-spy, clinic.js).", story)
    B("APM data (Sentry, Datadog).", story)
    B("Slow query logs.", story)
    story.append(PageBreak())

    # ===== 13. SCALABILITY =====
    H1("13. Scalability Agent", story)
    P("Scalability analysis answers: <i>at what user count does this "
      "system break, and what breaks first?</i>", story)
    H2("Inputs", story)
    B("Current traffic profile (RPS, P95 latency, DB QPS).", story)
    B("Topology - services, queues, caches, datastores.", story)
    B("Code-level signals - synchronous fan-out, missing caches.", story)
    H2("Output Report", story)
    C("Current capacity estimate:   ~5,000 concurrent users\n"
      "\n"
      "Bottlenecks (in order):\n"
      "  1. No Redis cache on /users  --> DB saturation at ~7k\n"
      "  2. Sequential DB calls in /orders\n"
      "  3. Missing index on payments.user_id\n"
      "\n"
      "Recommendations:\n"
      "  - Add Redis layer in front of /users (4-6h work)\n"
      "  - Batch DB calls in /orders endpoint\n"
      "  - Add composite index (user_id, created_at)\n"
      "\n"
      "Projected capacity after fixes: ~50,000 concurrent users", story)
    story.append(PageBreak())

    # ===== 14. DOCUMENTATION =====
    H1("14. Documentation Agent", story)
    P("The Documentation Agent maintains living docs grounded in code. "
      "When code changes, docs are flagged for review or regenerated.", story)
    H2("Doc Artifacts", story)
    kv_table([
        ["Module README",   "Auto-generated from AST and tests"],
        ["Architecture Map","Mermaid diagram from import graph"],
        ["API Reference",   "OpenAPI extracted from handlers"],
        ["Runbook",         "Failure modes and on-call steps"],
        ["Onboarding Guide","Tour for new engineers"],
    ], story, header=["Artifact", "Source of Truth"])
    H2("Stale Doc Detection", story)
    P("Each doc paragraph references a code anchor (file + symbol). "
      "When the anchor changes, the paragraph is marked <i>potentially "
      "stale</i> and re-validated.", story)
    story.append(PageBreak())

    # ===== 15. VIBE CODE DETECTION =====
    H1("15. Human vs Vibe-Code Detection", story)
    P("\"Vibe code\" is shorthand for LLM-generated code that looks "
      "plausible but reveals tell-tale signatures. Distinguishing it "
      "from human-written code helps teams understand who actually owns "
      "what they ship.", story)
    story.append(draw_vibecode_pie())
    story.append(Spacer(1, 6))
    H2("Signal Categories", story)
    kv_table([
        ["Lexical",
         "Uniform identifier naming, generic helpers (utils, helpers)"],
        ["Stylistic",
         "Triple-quoted docstrings on trivial helpers"],
        ["Structural",
         "Boilerplate try/except, defensive null checks"],
        ["Statistical",
         "Token-level perplexity bumps under base LLMs"],
        ["Behavioral",
         "Tests that mirror the production code 1:1"],
        ["Commit",
         "Bulk commits with no test/refactor interleaving"],
    ], story, header=["Category", "Examples"])
    H2("Calibration Caveats", story)
    P("No detector is perfect. The agent reports probabilities, never "
      "labels. Outputs include <i>top reasons</i> so engineers can "
      "judge the verdict themselves.", story)
    story.append(PageBreak())

    # ===== 16. TREE-SITTER =====
    H1("16. Tree-sitter Parsing Pipeline", story)
    P("Tree-sitter is the parsing backbone. It is fast, language-agnostic, "
      "and produces concrete syntax trees that survive partial-syntax "
      "errors - critical for live editing.", story)
    H2("Supported Languages", story)
    P("JavaScript, TypeScript, Python, Java, Go, Rust, C, C++, C#, PHP, "
      "Ruby, Kotlin, Swift, SQL, HTML, CSS, Markdown.", story)
    H2("Extraction Targets", story)
    B("Functions and methods (signature + body span).", story)
    B("Classes (with members and inheritance).", story)
    B("Imports and exports.", story)
    B("Type definitions and interfaces.", story)
    B("SQL queries embedded in strings.", story)
    B("API route declarations across frameworks.", story)
    H2("Resilience", story)
    P("Even when files contain syntax errors, tree-sitter returns a "
      "best-effort tree. The Repository Analyzer falls back to LSP or "
      "regex extractors for stubborn cases.", story)
    story.append(PageBreak())

    # ===== 17. NEO4J KG =====
    H1("17. Knowledge Graph Design with Neo4j", story)
    P("Code is fundamentally a graph - calls, imports, inheritance, "
      "data flow. Storing this graph natively unlocks queries that are "
      "expensive in flat search.", story)
    story.append(draw_kg_schema())
    story.append(Spacer(1, 6))
    H2("Core Node Labels", story)
    kv_table([
        ["File",      "Path, language, SHA"],
        ["Class",     "Name, kind, parent class"],
        ["Function",  "Signature, body span, complexity"],
        ["Module",    "Logical grouping"],
        ["DBTable",   "Schema, columns"],
        ["Endpoint",  "Method, path, handler"],
    ], story, header=["Label", "Properties"])
    H2("Sample Cypher", story)
    C("MATCH (f:Function {name:'getUser'})-[:CALLS*1..3]->(d)\n"
      "WHERE d:DBTable\n"
      "RETURN DISTINCT d.name", story)
    story.append(PageBreak())

    # ===== 18. QDRANT =====
    H1("18. Vector Memory with Qdrant", story)
    P("Qdrant stores embeddings for every chunk extracted by the parser. "
      "Hybrid search combines BM25 and vector similarity, then re-ranks "
      "with a cross-encoder for top-k results.", story)
    H2("Index Topology", story)
    kv_table([
        ["Embedding model",  "text-embedding-3-large (3072 dims)"],
        ["Chunk type",       "Function-level + summary-level"],
        ["Metadata",         "file, language, span, sha, last_seen"],
        ["Replica factor",   "2 (HA in staging+prod)"],
        ["Distance",         "Cosine"],
    ], story, header=["Setting", "Value"])
    H2("Why Hybrid Beats Vector-Only", story)
    P("Vector search recalls intent. BM25 anchors exact identifiers. "
      "Code retrieval punishes either approach alone - identifiers are "
      "the user's actual handle on the system, and semantic similarity "
      "alone misses them.", story)
    story.append(PageBreak())

    # ===== 19. CONTEXT COMPRESSION =====
    H1("19. Context Compression Strategies", story)
    P("Even with 200k-token windows, naive context loading is expensive. "
      "The agent applies multiple compression passes before sending text "
      "to the model.", story)
    H2("Compression Passes", story)
    kv_table([
        ["Deduplication",
         "Remove identical or near-identical snippets"],
        ["Summarization",
         "Replace bodies with one-line summaries when only signature matters"],
        ["Skeletonization",
         "Strip method bodies for files only referenced for shape"],
        ["Aliasing",
         "Replace long paths with short tokens (auth/login -> A1)"],
        ["Reranking",
         "Drop chunks whose relevance score is below threshold"],
    ], story, header=["Pass", "Effect"])
    H2("Empirical Savings", story)
    P("Across benchmark queries, compression cuts payload size by "
      "60-85% with under 3% loss in answer quality measured by human "
      "preference.", story)
    story.append(PageBreak())

    # ===== 20. VISUAL CONTEXT SYSTEM =====
    H1("20. User-Managed Visual Context System", story)
    P("Most agents auto-select context. This is convenient but wasteful "
      "- the model loads more than the question requires, and users pay "
      "for every token. We invert this: the user sees the available "
      "context as visual blocks and decides what enters the prompt.", story)
    story.append(draw_context_packs_diagram())
    story.append(Spacer(1, 6))
    H2("Why Visual Beats Implicit", story)
    B("Users see exactly what the agent will read.", story)
    B("Token cost is visible <i>before</i> the request runs.", story)
    B("Sensitive areas (auth, payments) can be excluded by default.", story)
    B("Power users learn what context produces what quality.", story)
    H2("Interaction Model", story)
    P("Each block - a context pack - is a draggable tile. Tiles can be "
      "<i>pinned</i> (stay attached across turns), <i>attached</i> "
      "(this turn only), or <i>excluded</i> (never auto-load). The "
      "agent's prompt is constructed only from attached + pinned tiles.", story)
    story.append(PageBreak())

    # ===== 21. TOKEN SAVING =====
    H1("21. Token Saving Strategies", story)
    P("Token spend is the single biggest driver of agent cost. We apply "
      "a layered strategy.", story)
    story.append(draw_token_savings_chart())
    story.append(Spacer(1, 6))
    H2("Strategies", story)
    kv_table([
        ["Visual context packs", "User explicitly attaches only what's needed"],
        ["Skeleton mode",        "Send signatures, fetch bodies on demand"],
        ["Summary cache",        "One-line summaries reused across turns"],
        ["Prefix caching",       "Hit provider prefix cache for repeated headers"],
        ["Model tiering",        "Cheaper model for routing/summarization"],
        ["Truncation budgets",   "Hard per-agent ceilings"],
    ], story, header=["Strategy", "Effect"])
    P("The combined effect: a typical impact-analysis query that would "
      "consume 42k tokens drops to ~14k when the user attaches only the "
      "two relevant packs.", story)
    story.append(PageBreak())

    # ===== 22. CONTEXT PACKS =====
    H1("22. Context Packs", story)
    P("A <b>context pack</b> is a named, versioned, compressed bundle of "
      "knowledge about one slice of the codebase. Packs are the atomic "
      "unit of attachable context.", story)
    H2("Pack Schema", story)
    C("{\n"
      "  \"id\": \"pack_auth_v3\",\n"
      "  \"label\": \"Auth Module\",\n"
      "  \"scope\": [\"src/auth/**\", \"migrations/auth_*\"],\n"
      "  \"summary\": \"JWT + session auth, refresh, RBAC...\",\n"
      "  \"tokens\": 1840,\n"
      "  \"embeddings\": \"qdrant://packs/auth_v3\",\n"
      "  \"graph_root\": \"neo4j://Module {name:'auth'}\",\n"
      "  \"refreshed_at\": \"2026-06-18T12:04:11Z\"\n"
      "}", story)
    H2("Pack Lifecycle", story)
    B("Auto-suggested by the Repository Analyzer.", story)
    B("Approved and labeled by the user.", story)
    B("Versioned per commit SHA.", story)
    B("Re-summarized when source files change >10%.", story)
    B("Retired when scope files are deleted.", story)
    story.append(PageBreak())

    # ===== 23. VISUAL WORKSPACE =====
    H1("23. Visual Workspace Design", story)
    P("The Visual Workspace is a thin UI surface - keyboard or mouse "
      "driven - showing all available packs as tiles. It is the user's "
      "context dashboard.", story)
    H2("Workspace Zones", story)
    kv_table([
        ["Pack Library", "All packs in the project"],
        ["Pinboard",     "Packs attached to every turn"],
        ["Stage",        "Packs attached to next message only"],
        ["Excluded",     "Packs banned from automatic selection"],
        ["Token Meter",  "Live token total of attached packs"],
        ["Cost Meter",   "Estimated USD cost for next request"],
    ], story, header=["Zone", "Purpose"])
    H2("Keyboard Affordances", story)
    B("Cmd/Ctrl + click: toggle pack attached/detached.", story)
    B("Shift + click: pin/unpin.", story)
    B("/ + pack name: command-bar attach.", story)
    B("Esc: clear stage but keep pinned.", story)
    H2("Design Principle", story)
    Q("The user is the orchestrator of their own context. The agent "
      "should propose, never silently load.", story)
    story.append(PageBreak())

    # ===== 24. GRAPHRAG =====
    H1("24. GraphRAG for Code", story)
    P("Traditional RAG retrieves chunks by vector similarity. GraphRAG "
      "first walks the knowledge graph to identify <i>relevant entities</i>, "
      "then retrieves chunks anchored to those entities. The result is "
      "context that respects code structure.", story)
    H2("Pipeline", story)
    B("Detect entities mentioned in the user query.", story)
    B("Map them to nodes in the knowledge graph.", story)
    B("Expand along typed edges with bounded depth.", story)
    B("Retrieve chunks anchored to the expanded subgraph.", story)
    B("Re-rank with cross-encoder.", story)
    B("Compress, then attach.", story)
    H2("Why This Works for Code", story)
    P("Most useful code retrievals are not similarity-driven - they are "
      "<i>dependency-driven</i>. \"What calls getUser?\" is a graph "
      "question, not an embedding question.", story)
    story.append(PageBreak())

    # ===== 25. MEMORY LAYERS =====
    H1("25. Long-Term Memory Layers", story)
    P("The agent's memory is organized into four layers, each with a "
      "different cost profile and persistence horizon.", story)
    story.append(draw_memory_layers_diagram())
    story.append(Spacer(1, 6))
    H2("Layer Responsibilities", story)
    kv_table([
        ["L1 - Knowledge Graph",
         "Permanent. Code structure and decisions."],
        ["L2 - Project Memory",
         "Persistent. User preferences, conventions, feedback."],
        ["L3 - Session Memory",
         "Hours. Recent turns and tool outputs."],
        ["L4 - Working Memory",
         "Single turn. Current question and active packs."],
    ], story, header=["Layer", "Description"])
    H2("Write Discipline", story)
    P("Each layer has explicit write rules. The agent does not silently "
      "promote ephemeral notes into long-term memory. Promotion requires "
      "explicit user approval (visible as a confirmation chip).", story)
    story.append(PageBreak())

    # ===== 26. LANGGRAPH =====
    H1("26. LangGraph Workflows", story)
    P("LangGraph models agent execution as a directed graph of nodes "
      "(LLM calls, tool calls, conditionals). This gives us deterministic "
      "control flow, retries, parallel branches, and resume-from-failure "
      "out of the box.", story)
    story.append(draw_langgraph_flow())
    story.append(Spacer(1, 6))
    H2("Why Not a Loop of LLM Calls", story)
    P("Free-form ReAct loops are unpredictable. LangGraph lets us "
      "express invariants like \"verify before answer\" and \"never "
      "call write tools before confirmation\" as graph structure rather "
      "than prompt instructions.", story)
    story.append(PageBreak())

    # ===== 27. MCP =====
    H1("27. MCP Server Integration", story)
    P("The Model Context Protocol is the agent's plug for external "
      "tools. We expose the agent as an MCP server and also consume "
      "third-party MCP servers (Slack, Linear, GitHub, Sentry).", story)
    H2("Surfaces We Expose", story)
    kv_table([
        ["agent.review",       "Review a diff"],
        ["agent.impact",       "Impact analysis for a change"],
        ["agent.ask",          "Free-form Q&A over the repo"],
        ["agent.architecture", "Architecture report"],
        ["agent.scalability",  "Capacity estimate"],
    ], story, header=["Tool", "Behavior"])
    H2("MCP Consumed", story)
    B("GitHub: PR comments, file content, blame.", story)
    B("Linear: tickets linked to code areas.", story)
    B("Sentry: link errors to functions.", story)
    B("Slack: post findings to channels.", story)
    story.append(PageBreak())

    # ===== 28. LOCAL LLM =====
    H1("28. Local LLM Support", story)
    P("Some teams cannot send code to hosted models. The agent supports "
      "a local-only mode with fallback to smaller open-weight models.", story)
    H2("Supported Open Models", story)
    kv_table([
        ["Qwen3-Coder",   "Strong code completion and analysis"],
        ["DeepSeek-V3",   "High reasoning quality, lower cost"],
        ["Llama 3.x",     "Wide ecosystem, predictable performance"],
        ["Mixtral",       "Mixture-of-experts, throughput friendly"],
    ], story, header=["Model", "Note"])
    H2("Quality Tradeoffs", story)
    P("Local-only mode trades raw reasoning quality for privacy. "
      "Specialized sub-agents (security pattern match, parsing, graph "
      "queries) work equally well locally because the LLM is the "
      "narrator, not the analyzer.", story)
    story.append(PageBreak())

    # ===== 29. COST OPTIMIZATION =====
    H1("29. Cost Optimization", story)
    P("Agent economics are won or lost at the prompt boundary. The "
      "system applies multiple knobs simultaneously.", story)
    H2("Knobs", story)
    B("Model routing: small models for cheap stages, large models only "
      "for synthesis.", story)
    B("Prefix caching: system prompts and pack headers reused across "
      "turns hit the provider cache.", story)
    B("Pre-compute: heavy graph queries are cached per commit.", story)
    B("Lazy bodies: signatures sent first; bodies on demand.", story)
    B("Batching: PR comments synthesized in one pass.", story)
    H2("Sample Unit Economics", story)
    kv_table([
        ["Repo Q&A",        "~$0.015/turn after compression"],
        ["Diff review",     "~$0.05 per 200-line diff"],
        ["Impact analysis", "~$0.08 per change"],
        ["Scalability",     "~$0.20 per report"],
    ], story, header=["Task", "Estimated Cost"])
    story.append(PageBreak())

    # ===== 30. MVP ROADMAP =====
    H1("30. MVP Roadmap", story)
    P("The fastest path to a useful product is a tight loop: index, "
      "review, answer questions. Everything else is layered on once "
      "the core feels alive.", story)
    H2("Phase 1 - Foundation (4-6 weeks)", story)
    B("Tree-sitter ingestion + Qdrant embedding.", story)
    B("Basic chat over the repo with citations.", story)
    B("CLI surface only.", story)
    H2("Phase 2 - Review (4 weeks)", story)
    B("Diff-aware Code Review agent.", story)
    B("GitHub PR comment integration.", story)
    B("Severity-tagged structured output.", story)
    H2("Phase 3 - Graph (6 weeks)", story)
    B("Neo4j knowledge graph build pipeline.", story)
    B("Impact analysis agent.", story)
    B("GraphRAG retrieval.", story)
    H2("Phase 4 - Visual Context (4 weeks)", story)
    B("Context packs.", story)
    B("Visual workspace with token meter.", story)
    B("Pinboard + Stage workflow.", story)
    H2("Phase 5 - Architecture + Scalability (6 weeks)", story)
    B("Architecture agent with graph metrics.", story)
    B("Scalability report generator.", story)
    B("Vibe-Code detection.", story)
    story.append(PageBreak())

    # ===== 31. FUTURE =====
    H1("31. Future Autonomous Capabilities", story)
    P("Once the agent can analyze, the next horizon is acting. Each "
      "step requires more trust and tighter guardrails.", story)
    H2("Capability Ladder", story)
    kv_table([
        ["Read-only analysis",
         "Today. Reviews and reports only."],
        ["Suggest patches",
         "Agent proposes diffs; human applies."],
        ["Apply with approval",
         "Agent commits to a branch on click."],
        ["PR opens",
         "Agent opens PRs with test plans."],
        ["Closed-loop fix",
         "Agent detects regression and ships fix."],
        ["Roadmap reasoning",
         "Agent proposes the next quarter's bets."],
    ], story, header=["Level", "Behavior"])
    H2("Guardrails", story)
    P("Each level requires a higher confidence threshold and explicit "
      "user opt-in. Critical paths (auth, payments, migrations) carry "
      "permanent human-in-the-loop locks regardless of confidence.", story)
    story.append(PageBreak())

    # ===== 32. COMPETITIVE LANDSCAPE =====
    H1("32. Competitive Analysis", story)
    P("This space is crowded, but no incumbent owns the full stack. "
      "Each tool wins one dimension and loses others.", story)
    kv_table([
        ["Cursor",
         "Editor",
         "Real-time edits",
         "Shallow architecture"],
        ["CodeRabbit",
         "PR Reviewer",
         "Strong PR coverage",
         "No graph reasoning"],
        ["Sourcegraph Cody",
         "Search",
         "Best code search",
         "Light agentic ability"],
        ["SonarQube",
         "Static Analysis",
         "Deterministic rules",
         "No LLM reasoning"],
        ["Devin",
         "Autonomous agent",
         "End-to-end tasks",
         "Brittle on big repos"],
        ["Our Agent",
         "Staff Engineer",
         "Graph + multi-agent + visual context",
         "New entrant"],
    ], story,
       col_widths=(3.5*cm, 3.5*cm, 4.5*cm, 4.5*cm),
       header=["Product", "Category", "Strength", "Weakness"])
    H2("Wedge", story)
    P("Our wedge is the combination: graph-native reasoning, multi-agent "
      "specialization, and user-controlled visual context. None of these "
      "alone is novel; the integration is.", story)
    story.append(PageBreak())

    # ===== 33. RISKS =====
    H1("33. Risks and Limitations", story)
    H2("Technical Risks", story)
    B("Graph build cost on very large monorepos.", story)
    B("Stale embeddings if incremental indexing falls behind commits.", story)
    B("LLM hallucinations citing non-existent functions.", story)
    B("Token spend spirals without strict budgeting.", story)
    H2("Product Risks", story)
    B("Visual context model adds learning curve.", story)
    B("Trust must be earned: false positives kill PR review tools.", story)
    B("Local-LLM mode reduces quality and may disappoint users.", story)
    H2("Operational Risks", story)
    B("Storing customer code raises compliance burden.", story)
    B("On-prem deployment doubles support cost.", story)
    B("Model providers can change pricing overnight.", story)
    H2("Mitigations", story)
    P("Strict citation discipline (every claim links to file + line). "
      "Hard token ceilings per task. Eval suite against known-good "
      "review benchmarks. Customer-controlled retention.", story)
    story.append(PageBreak())

    # ===== 34. PRODUCTION ARCHITECTURE =====
    H1("34. Production Architecture", story)
    P("Production deployment must be horizontally scalable and "
      "tenant-isolated. Each customer's index lives in its own logical "
      "partition.", story)
    H2("Reference Topology", story)
    layers = [
        ("Edge",       "API gateway + auth + rate limiting", PRIMARY, colors.white),
        ("Agent Pods", "Orchestrator + sub-agents, autoscaled", ACCENT, colors.white),
        ("Queue",      "BullMQ on Redis for long jobs",      WARN, colors.white),
        ("Index",      "Qdrant cluster + Neo4j Aura",        SUCCESS, colors.white),
        ("Cold Store", "Postgres + S3 for artifacts",        DARK, colors.white),
        ("Observability", "OpenTelemetry, Loki, Grafana",    GREY, colors.white),
    ]
    stack_diagram("Production Stack", layers, story)
    H2("Tenant Isolation", story)
    B("Per-tenant Qdrant collection.", story)
    B("Per-tenant Neo4j database (separate logical DB in Aura).", story)
    B("Per-tenant S3 prefix with KMS keys.", story)
    B("Per-tenant prompt headers carry tenant id; cross-tenant calls "
      "are rejected at the gateway.", story)
    story.append(PageBreak())

    # ===== 35. CONCLUSION =====
    H1("35. Conclusion", story)
    P("Building an AI Staff Engineer Agent is achievable today by "
      "combining mature components - tree-sitter, Qdrant, Neo4j, "
      "LangGraph, MCP - with disciplined context engineering and a "
      "multi-agent orchestration layer.", story)
    P("The differentiator is not any single agent but the combination: "
      "graph-grounded retrieval, user-controlled visual context, and "
      "specialized agents that defer to deterministic tools for facts. "
      "Done right, the result behaves like a tireless senior engineer "
      "embedded in every repository, every PR, and every decision.", story)
    Q("\"The agent that wins this category will not be the one with the "
      "biggest model. It will be the one whose context is the cleanest, "
      "whose graph is the deepest, and whose users feel in control.\"", story)
    H2("Next Steps", story)
    B("Stand up the Phase 1 stack on one internal repository.", story)
    B("Run a 100-question retrieval benchmark against open-source repos.", story)
    B("Ship the visual context workspace as the headline UX feature.", story)
    B("Publish reference packs for popular frameworks.", story)
    B("Open MCP surfaces for the wider ecosystem.", story)
    story.append(Spacer(1, 18))
    NOTE("End of Specification - AI Staff Engineer Agent v1.0", story)

    doc.build(story, onFirstPage=header_footer, onLaterPages=header_footer)
    print(f"Wrote: {OUT}")


if __name__ == "__main__":
    build()
