import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { AppHeader } from "@/components/AppHeader"
import { ItemInputBar } from "@/components/ItemInputBar"
import { GroceryItemComponent } from "@/components/GroceryItemComponent"
import { GrocerySection } from "@/components/GrocerySection"
import { LearningTipDialog } from "@/components/LearningTipDialog"
import type { GroceryItem, Section } from "@/lib/types"

describe("AppHeader", () => {
  it("summarizes readiness in a single status badge", () => {
    render(
      <AppHeader
        isOnline={true}
        serviceWorkerReady={true}
        pwaStatusLabel="Ready offline"
        onSettingsClick={vi.fn()}
        pwaInstall={{
          canInstall: false,
          isIOS: false,
          triggerInstall: vi.fn(),
        }}
        totalItems={2}
        unresolvedItems={1}
        progress={50}
        canToggleLearningProgress={false}
        learningProgressVisible={false}
        onToggleLearningProgress={vi.fn()}
      />,
    )

    expect(screen.getByText("Ready in store")).toBeInTheDocument()
    expect(screen.queryByLabelText("Install app")).not.toBeInTheDocument()
  })

  it("shows syncing status without a spinning header animation", () => {
    const { container } = render(
      <AppHeader
        isOnline={true}
        serviceWorkerReady={true}
        pwaStatusLabel="Ready offline"
        onSettingsClick={vi.fn()}
        pwaInstall={{
          canInstall: false,
          isIOS: false,
          triggerInstall: vi.fn(),
        }}
        totalItems={2}
        unresolvedItems={1}
        progress={50}
        canToggleLearningProgress={false}
        learningProgressVisible={false}
        onToggleLearningProgress={vi.fn()}
        googleSheetsSyncStatus="syncing"
      />,
    )

    expect(screen.getByText("Syncing…")).toBeInTheDocument()
    expect(container.querySelector(".animate-spin")).toBeNull()
  })
})

describe("ItemInputBar", () => {
  it("keeps secondary tools hidden until the tools sheet is opened", async () => {
    const user = userEvent.setup()
    const onToggleOrganizeMode = vi.fn()

    render(
      <ItemInputBar
        newItemName=""
        onNewItemNameChange={vi.fn()}
        onAddItem={vi.fn()}
        onKeyPress={vi.fn()}
        isListening={false}
        isSupported={true}
        onVoiceToggle={vi.fn()}
        onRecipeClick={vi.fn()}
        onScanClick={vi.fn()}
        onBulkAddClick={vi.fn()}
        onClearCompleted={vi.fn()}
        onReorganize={vi.fn()}
        onClearAll={vi.fn()}
        onToggleOrganizeMode={onToggleOrganizeMode}
        hasCheckedItems={true}
        hasItems={true}
        isOrganizeMode={false}
      />,
    )

    expect(screen.queryByText("Add from recipe")).not.toBeInTheDocument()
    expect(screen.queryByText("Clear completed")).not.toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Open tools" }))

    expect(screen.getByText("Add from recipe")).toBeInTheDocument()
    expect(screen.getByText("Clear completed")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Organize sections" }))

    expect(onToggleOrganizeMode).toHaveBeenCalledTimes(1)
  })
})

describe("GrocerySection", () => {
  const section: Section = {
    id: "produce",
    name: "Produce",
    items: [
      {
        id: "item-1",
        name: "Apples",
        checked: false,
        addedAt: Date.now(),
        quantity: 1,
      },
    ],
    averagePosition: 0,
    confidence: 0.9,
    icon: "🥬",
  }

  it("renders a category icon and hides section editing controls until organize mode is enabled", async () => {
    const user = userEvent.setup()
    const onToggleCollapse = vi.fn()
    const { rerender } = render(
      <GrocerySection
        section={section}
        onToggle={vi.fn()}
        onDelete={vi.fn()}
        onEdit={vi.fn()}
        onQuantityChange={vi.fn()}
        onCategoryChange={vi.fn()}
        onRenameSection={vi.fn()}
        showConfidence={true}
        isCollapsed={false}
        onToggleCollapse={onToggleCollapse}
        isOrganizeMode={false}
      />,
    )

    expect(screen.getByLabelText("Produce icon")).toBeInTheDocument()
    expect(screen.queryByLabelText("Drag to reorder")).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Rename section" })).not.toBeInTheDocument()
    // "1 item" rather than a "0/1" fraction that reads like progress
    expect(screen.getByText("1 item")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Collapse section" }))
    expect(onToggleCollapse).toHaveBeenCalledWith("produce")

    rerender(
      <GrocerySection
        section={section}
        onToggle={vi.fn()}
        onDelete={vi.fn()}
        onEdit={vi.fn()}
        onQuantityChange={vi.fn()}
        onCategoryChange={vi.fn()}
        onRenameSection={vi.fn()}
        showConfidence={true}
        isCollapsed={false}
        onToggleCollapse={vi.fn()}
        isOrganizeMode={true}
      />,
    )

    expect(screen.getByLabelText("Drag to reorder")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Rename section" })).toBeInTheDocument()
  })
})

describe("GroceryItemComponent", () => {
  it("moves rename and delete into an overflow menu", async () => {
    const user = userEvent.setup()
    const item: GroceryItem = {
      id: "item-1",
      name: "Apples",
      checked: false,
      addedAt: Date.now(),
      quantity: 1,
    }

    render(
      <GroceryItemComponent
        item={item}
        onToggle={vi.fn()}
        onDelete={vi.fn()}
        onEdit={vi.fn()}
        onQuantityChange={vi.fn()}
        onCategoryChange={vi.fn()}
      />,
    )

    expect(screen.queryByRole("button", { name: "Rename item" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Delete item" })).not.toBeInTheDocument()
    expect(screen.queryByText("Recategorize")).not.toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Item actions" }))

    expect(screen.getByText("Recategorize")).toBeInTheDocument()
    expect(screen.getByText("Rename item")).toBeInTheDocument()
    expect(screen.getByText("Delete item")).toBeInTheDocument()
  })

  it("opens a recategorize dialog from the overflow menu", async () => {
    const user = userEvent.setup()
    const item: GroceryItem = {
      id: "item-1",
      name: "Apples",
      checked: false,
      addedAt: Date.now(),
      quantity: 1,
    }

    render(
      <GroceryItemComponent
        item={item}
        onToggle={vi.fn()}
        onDelete={vi.fn()}
        onEdit={vi.fn()}
        onQuantityChange={vi.fn()}
        onCategoryChange={vi.fn()}
      />,
    )

    await user.click(screen.getByRole("button", { name: "Item actions" }))
    await user.click(screen.getByText("Recategorize"))

    expect(screen.getByRole("dialog")).toBeInTheDocument()
    expect(screen.getByText("Recategorize item")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Save category" })).toBeInTheDocument()
  })

  it("makes the whole row a check target without stealing the menu button", async () => {
    const user = userEvent.setup()
    const onToggle = vi.fn()
    const item: GroceryItem = {
      id: "item-1",
      name: "Apples",
      checked: false,
      addedAt: Date.now(),
      quantity: 1,
    }

    render(
      <GroceryItemComponent
        item={item}
        onToggle={onToggle}
        onDelete={vi.fn()}
        onEdit={vi.fn()}
        onQuantityChange={vi.fn()}
        onCategoryChange={vi.fn()}
      />,
    )

    // One-handed tapping: the row label, not just the checkbox, toggles -
    // and one tap is one toggle, not two (the checkbox lives inside the label).
    await user.click(screen.getByText("Apples"))
    expect(onToggle).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole("checkbox"))
    expect(onToggle).toHaveBeenCalledTimes(2)

    // The actions menu must be a sibling of the label: nesting a button inside
    // a <label> is invalid markup and makes AT announce the row as one control.
    expect(screen.getByRole("button", { name: "Item actions" }).closest("label")).toBeNull()

    await user.click(screen.getByRole("button", { name: "Item actions" }))
    expect(onToggle).toHaveBeenCalledTimes(2)
  })

  it("only shows a quantity marker when it is not the default 1", () => {
    const item: GroceryItem = {
      id: "item-1",
      name: "Apples",
      checked: false,
      addedAt: Date.now(),
      quantity: 1,
    }

    const { rerender } = render(
      <GroceryItemComponent
        item={item}
        onToggle={vi.fn()}
        onDelete={vi.fn()}
        onEdit={vi.fn()}
        onQuantityChange={vi.fn()}
        onCategoryChange={vi.fn()}
      />,
    )

    // No quantity line at all, and specifically no "×1" marker: the default
    // quantity must not be rendered, only the interesting values.
    expect(screen.queryByText(/Quantity/)).not.toBeInTheDocument()
    expect(screen.queryByText("×1")).not.toBeInTheDocument()

    rerender(
      <GroceryItemComponent
        item={{ ...item, quantity: 3 }}
        onToggle={vi.fn()}
        onDelete={vi.fn()}
        onEdit={vi.fn()}
        onQuantityChange={vi.fn()}
        onCategoryChange={vi.fn()}
      />,
    )

    expect(screen.getByText("×3")).toBeInTheDocument()
    // Screen readers still hear the quantity, via the checkbox's name.
    expect(screen.getByRole("checkbox", { name: "Apples, quantity 3" })).toBeInTheDocument()
  })
})

describe("LearningTipDialog", () => {
  it("keeps a valid dialog description while rendering rich tab content", () => {
    render(
      <LearningTipDialog
        open={true}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByRole("dialog")).toBeInTheDocument()
    expect(screen.getByText("This app learns your store layout by tracking the order you check off items during your shopping trips.")).toBeInTheDocument()
    expect(screen.getByText("Learn how route learning and voice controls work while you shop.")).toBeInTheDocument()
  })
})